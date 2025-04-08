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

conda init || return
conda create -n notebookpack \
    --override-channels --strict-channel-priority \
    -c conda-forge -c nodefaults \
    jupyterlab=4 nodejs=20 git copier=7 jinja2-time jupyterlite-core jupyterlab_widgets \
    || return

if ! conda activate notebookpack; then
    >&2 echo "Restart your shell and source this script again (conda init has updated .bashrc, must load changes in shell)"
    return
fi

(
    cd jupyter-extension \
    && pip install -e . \
    && jupyter labextension develop --overwrite .
) || return
