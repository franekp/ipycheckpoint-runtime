#!/bin/bash

(return 0 2>/dev/null) && sourced=1 || sourced=0
if [ $sourced -eq 1 ]; then
  echo "This script is being sourced"
else
  echo "This script is being executed"
fi
