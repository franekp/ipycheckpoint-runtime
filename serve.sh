#!/bin/bash

(return 0 2>/dev/null) && sourced=1 || sourced=0

if [ $sourced -eq 1 ]; then
    >&2 echo "This script must be executed, not sourced"
    return
fi

if ! ls jupyter-extension/notebookpack_runtime/__init__.py >/dev/null 2>&1; then
    >&2 echo "This script must be executed from the root of the notebookpack-runtime repo"
    exit 1
fi

set -eu -o pipefail

conda activate notebookpack
(cd jupyterlite-dist/site; python -m http.server -b 127.0.0.1)
