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

(cd jupyter-extension && jlpm run build)
(cd jupyterlite-dist; jupyter lite build --output-dir site \
    --piplite-wheels=https://files.pythonhosted.org/packages/02/65/ad2bc85f7377f5cfba5d4466d5474423a3fb7f6a97fd807c06f92dd3e721/plotly-6.0.1-py3-none-any.whl \
    --piplite-wheels=https://files.pythonhosted.org/packages/22/2d/9c0b76f2f9cc0ebede1b9371b6f317243028ed60b90705863d493bae622e/ipywidgets-8.1.5-py3-none-any.whl \
)
