import unittest

import numpy as np
import xarray as xr

from app import evidence


class EvidenceEngineTests(unittest.TestCase):
    def test_haversine_is_zero_and_symmetric(self):
        self.assertEqual(evidence.haversine_km(14, 86, 14, 86), 0)
        self.assertAlmostEqual(evidence.haversine_km(14, 86, 15, 87), evidence.haversine_km(15, 87, 14, 86))

    def test_qc_policy_excludes_bad_and_keeps_good(self):
        profile = {"profile": [
            {"depth": 5, "temperature": 20, "temperature_qc": "1"},
            {"depth": 10, "temperature": 21, "temperature_qc": "2"},
            {"depth": 20, "temperature": 99, "temperature_qc": "4"},
        ]}
        valid, summary = evidence._valid_points(profile, "temperature", ("1", "2"))
        self.assertEqual([p["depth"] for p in valid], [5, 10])
        self.assertEqual((summary["good"], summary["probably_good"], summary["rejected"]), (1, 1, 1))

    def test_depth_overlap_partial_and_none(self):
        points = [{"depth": 50}, {"depth": 150}]
        ratio, common = evidence._depth_overlap(points, 0, 200)
        self.assertEqual(ratio, 0.5)
        self.assertEqual(common, [50.0, 150.0])
        self.assertEqual(evidence._depth_overlap(points, 200, 300)[0], 0)

    def test_linear_time_interpolation(self):
        times = np.array(["2019-01-01", "2019-01-03"], dtype="datetime64[ns]")
        data = xr.DataArray(np.array([[[[0.0]]], [[[2.0]]]]), dims=("time", "depth", "lat", "lon"))
        values, left, right, method = evidence._time_profile(data, times, np.datetime64("2019-01-02"))
        self.assertAlmostEqual(values[0, 0, 0], 1)
        self.assertEqual((left, right, method), (0, 1, "linear_time_interpolation"))

    def test_exact_and_outside_time_matching(self):
        times = np.array(["2019-01-01", "2019-01-03"], dtype="datetime64[ns]")
        data = xr.DataArray(np.array([[[[0.0]]], [[[2.0]]]]), dims=("time", "depth", "lat", "lon"))
        _, left, right, method = evidence._time_profile(data, times, times[0])
        self.assertEqual((left, right, method), (0, 0, "exact_timestep"))
        _, left, right, method = evidence._time_profile(data, times, np.datetime64("2018-12-01"))
        self.assertEqual((left, right, method), (0, 0, "nearest_timestep"))

    def test_nearest_wet_cell_skips_closer_land(self):
        values = np.full((2, 2, 2), np.nan)
        values[:, 1, 1] = [20, 10]
        distance, _, j, i = evidence._nearest_wet_cell(values, np.array([0, 1]), np.array([0, 1]), 0, 0)
        self.assertEqual((j, i), (1, 1))
        self.assertGreater(distance, 0)

    def test_metrics_have_known_values_and_no_short_correlation(self):
        metrics = evidence._metrics(np.array([2.0, 4.0]), np.array([1.0, 2.0]))
        self.assertEqual(metrics["bias"], 1.5)
        self.assertEqual(metrics["mae"], 1.5)
        self.assertAlmostEqual(metrics["rmse"], 1.5811)
        self.assertNotIn("correlation", metrics)

    def test_bootstrap_ci_is_deterministic_and_contains_point_estimates(self):
        model = np.array([2.0, 3.5, 4.0, 6.0, 6.5])
        observed = np.array([1.0, 3.0, 5.0, 5.0, 7.0])
        first = evidence._metrics(model, observed)
        second = evidence._metrics(model, observed)
        self.assertEqual(first["confidence_intervals_95"], second["confidence_intervals_95"])
        for name in ("bias", "mae", "rmse"):
            low, high = first["confidence_intervals_95"][name]
            self.assertLessEqual(low, first[name])
            self.assertGreaterEqual(high, first[name])

    def test_match_confidence_is_separate_and_degrades_with_mismatch(self):
        qc = {"good": 8, "probably_good": 0, "rejected": 0}
        close = evidence._comparison_confidence(10, 12, 8, qc)
        distant = evidence._comparison_confidence(300, 24 * 60, 2, qc)
        self.assertGreater(close["score"], distant["score"])
        self.assertIn("separate from model accuracy", close["meaning"])


if __name__ == "__main__":
    unittest.main()
