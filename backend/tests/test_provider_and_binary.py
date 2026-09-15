import unittest

from app import ocean


class ProviderAndBinaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ocean.load()

    def test_catalog_exposes_dataset_identity_and_capabilities(self):
        payload = ocean.get_catalog()
        self.assertEqual(payload["datasets"][0]["id"], "incois_argo_mnt_VAM")
        self.assertTrue(payload["capabilities"]["supports"]["teos10"])
        self.assertTrue(payload["capabilities"]["supports"]["binary_volume"])

    def test_binary_roi_shape_matches_payload(self):
        response = ocean.get_binary_volume(
            variable="temperature", timestep=0,
            lat_min=10, lat_max=12, lon_min=80, lon_max=83,
            depth_min=None, depth_max=None, stride=2,
        )
        shape = [int(value) for value in response.headers["x-oceanscope-shape"].split(",")]
        self.assertEqual(len(response.body), 4 * shape[0] * shape[1] * shape[2])
        self.assertEqual(response.headers["x-oceanscope-missing"], "NaN")


if __name__ == "__main__":
    unittest.main()
