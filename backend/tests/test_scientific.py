import unittest

import numpy as np

from app.scientific import horizontal_profile, teos10_profile


class ScientificDiagnosticsTests(unittest.TestCase):
    def test_bilinear_profile_at_cell_center(self):
        values = np.array([
            [[10.0, 20.0], [30.0, 40.0]],
            [[11.0, 21.0], [31.0, 41.0]],
        ])
        profile, method, footprint, fallback = horizontal_profile(
            values, np.array([0.0, 1.0]), np.array([70.0, 71.0]), 0.5, 70.5,
        )
        np.testing.assert_allclose(profile, [25.0, 26.0])
        self.assertEqual(method, "bilinear_horizontal_interpolation")
        self.assertGreater(footprint, 100)
        self.assertEqual(fallback, 0)

    def test_wet_corner_fallback_does_not_turn_missing_into_zero(self):
        values = np.array([[[10.0, np.nan], [30.0, 40.0]]])
        profile, method, _, fallback = horizontal_profile(
            values, np.array([0.0, 1.0]), np.array([70.0, 71.0]), 0.5, 70.5,
        )
        self.assertAlmostEqual(profile[0], (10 + 30 + 40) / 3)
        self.assertEqual(method, "wet_corner_weighted_fallback")
        self.assertEqual(fallback, 1)

    def test_teos10_known_ocean_profile_is_physically_ordered(self):
        result = teos10_profile(
            temperature=[29.0, 27.0, 20.0, 13.0, 8.0],
            practical_salinity=[34.0, 34.2, 34.8, 35.0, 34.9],
            depths=[5, 50, 100, 200, 500], lat=15.0, lon=85.0,
        )
        self.assertEqual(result["method"], "TEOS-10 via GSW")
        self.assertEqual(len(result["profile"]), 5)
        self.assertGreater(result["profile"][-1]["sigma0"], result["profile"][0]["sigma0"])
        self.assertIn(result["thermocline_depth_m"], [5.0, 50.0, 100.0, 200.0, 500.0])
        self.assertTrue(result["stratification"])


if __name__ == "__main__":
    unittest.main()
