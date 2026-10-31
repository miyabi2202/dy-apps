"""The service's HTTP side, with a fake model: what it answers and what it refuses."""

import json
import os
import sys
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from serve import handler  # noqa: E402


def fake_encode(texts, kind):
    # The kind shows in the vector, so a test can tell queries from documents.
    return [[1.0 if kind == "query" else 0.0, float(len(text))] for text in texts]


@pytest.fixture
def url():
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler("fake/model", 0.47, fake_encode))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


def post(url, body):
    request = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST")
    request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request) as response:
        return json.load(response)


def test_info_says_the_model_its_size_and_cutoff(url):
    with urllib.request.urlopen(f"{url}/info") as response:
        assert json.load(response) == {"model": "fake/model", "dims": 2, "cutoff": 0.47}


def test_embeds_queries_and_documents_apart(url):
    assert post(f"{url}/embed", {"texts": ["稻香", "主人"], "kind": "query"}) == {
        "model": "fake/model",
        "vectors": [[1.0, 2.0], [1.0, 2.0]],
    }
    assert post(f"{url}/embed", {"texts": ["小黑"], "kind": "document"})["vectors"] == [[0.0, 2.0]]
    assert post(f"{url}/embed", {"texts": [], "kind": "document"})["vectors"] == []


def test_refuses_what_it_cant_read(url):
    for body in [{"texts": "稻香", "kind": "query"}, {"texts": ["稻香"], "kind": "other"}, [1]]:
        with pytest.raises(urllib.error.HTTPError) as error:
            post(f"{url}/embed", body)
        assert error.value.code == 400
