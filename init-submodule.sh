#!/bin/bash

git submodule init
git submodule update --remote
git submodule foreach 'branch="$(git config -f $toplevel/.gitmodules submodule.$name.branch)"; git switch $branch'
