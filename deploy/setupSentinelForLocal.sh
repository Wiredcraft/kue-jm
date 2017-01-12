#!/bin/sh

set -e

DIR=`cd $( dirname "${BASH_SOURCE[0]}" ) && pwd`
REDIS_SERVER=$REDIS_HOME"redis-server"

SLAVE_DIRECTORY="/tmp/redis_slave"
[ -d "$SLAVE_DIRECTORY" ] || mkdir $SLAVE_DIRECTORY

echo "***********   setup redis instances"

$REDIS_SERVER --port 6379 &

echo "***********   setup redis slave"

$REDIS_SERVER $DIR"/redis_slave_jq.conf" &

echo "***********   setup redis sentinel"

[ -e $DIR"/sentinel_for_jq_local.conf" ] || \
  cp $DIR"/sentinel_for_jq.conf" $DIR/sentinel_for_jq_local.conf
$REDIS_SERVER $DIR"/sentinel_for_jq_local.conf" --sentinel &