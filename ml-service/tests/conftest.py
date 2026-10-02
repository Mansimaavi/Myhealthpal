import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# build the API's index in a temp folder instead of ml-service/index
os.environ.setdefault("INDEX_DIR", os.path.join(tempfile.mkdtemp(), "index"))
