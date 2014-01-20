#!/bin/bash

# This is a convenience script to force git to pull down the latest
# version of DocBuilder

echo deployment_details.js will be copied to /tmp. Copy it back if you had custom settings that were overwritten by GIT

cp deployment_details.js /tmp

git fetch --all
git reset --hard origin/devel
