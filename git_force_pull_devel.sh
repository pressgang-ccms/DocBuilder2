#!/bin/bash

#  Copyright 2011-2014 Red Hat, Inc
#
#  This file is part of PressGang CCMS.
#
#  PressGang CCMS is free software: you can redistribute it and/or modify
#  it under the terms of the GNU Lesser General Public License as published by
#  the Free Software Foundation, either version 3 of the License, or
#  (at your option) any later version.
#
#  PressGang CCMS is distributed in the hope that it will be useful,
#  but WITHOUT ANY WARRANTY; without even the implied warranty of
#  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#  GNU Lesser General Public License for more details.
#
#  You should have received a copy of the GNU Lesser General Public License
#  along with PressGang CCMS.  If not, see <http://www.gnu.org/licenses/>.

# This is a convenience script to force git to pull down the latest
# version of DocBuilder

echo config.js will be copied to /tmp. Copy it back if you had custom settings that were overwritten by GIT

cp src/config.js /tmp

git fetch --all
git reset --hard origin/devel
