#!/bin/bash

(return 0 2>/dev/null) && sourced=1 || sourced=0

if [ $sourced -eq 1 ]; then
    >&2 echo "This script must be executed, not sourced"
    return
fi

if ! ls jupyter-extension/ipycheckpoint_runtime/__init__.py >/dev/null 2>&1; then
    >&2 echo "This script must be executed from the root of the ipycheckpoint-runtime repo"
    exit 1
fi

set -eu -o pipefail

if ! [[ $(which python) =~ "ipycheckpoint" ]]; then
   echo "Source activate-setup.sh first"
   exit 1
fi

# (cd jupyter-extension && jlpm run build)
(cd pyodide-kernel; jlpm build:prod)

(cd jupyterlite-dist; jupyter lite build --output-dir site \
    --FederatedExtensionAddon.extra_labextensions_path=../pyodide-kernel/jupyterlite_pyodide_kernel/
)
