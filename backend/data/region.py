"""
Single source of truth for the study region.

Both the ocean-data subset (download_incois.py) and the coastline geometry
(prepare_geography.py) import these bounds, so the terrain grid and the
landmasses can never drift out of alignment.

India EEZ region: Arabian Sea + Bay of Bengal, covering the Indian mainland
coast, Sri Lanka, the Andaman & Nicobar Islands and Lakshadweep.
"""

LAT_MIN, LAT_MAX = 5.0, 25.0
LON_MIN, LON_MAX = 65.0, 97.0

# Depth levels (metres). These exist exactly on the INCOIS ZAX axis; 5 m is the
# shallowest level INCOIS publishes, so it stands in for "surface".
DEPTHS = [5.0, 50.0, 100.0, 200.0, 500.0]
