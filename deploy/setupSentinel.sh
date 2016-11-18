#!/bin/sh

set -e
echo "setup redis slave"

redis-server ${TRAVIS_BUILD_DIR}/deploy/redis_slave_jq.conf &

echo "setup redis sentinel"

redis-server ${TRAVIS_BUILD_DIR}/deploy/sentinel_for_jq.conf --sentinel &
