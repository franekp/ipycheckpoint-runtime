#!/bin/bash

(return 0 2>/dev/null) && sourced=1 || sourced=0

if [ $sourced -eq 0 ]; then
    >&2 echo "This script must be sourced, not executed"
    exit 1
fi

if ! ls jupyter-extension/notebookpack_runtime/__init__.py >/dev/null 2>&1; then
    >&2 echo "This script must be sourced from the root of the notebookpack-runtime repo"
    return
fi

conda activate notebookpack

(
    cd jupyter-extension \
    && pip install -e . \
    && jupyter labextension develop --overwrite .
) || return
