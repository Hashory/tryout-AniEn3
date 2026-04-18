#!/bin/bash
echo "Initializing Garage cluster..."
# Wait for node to be available
sleep 2 
NODE_ID=$(docker exec garage /garage -c /etc/garage/garage.toml status | awk 'NR>2 {print $1; exit}')
if [ -z "$NODE_ID" ]; then
  echo "Failed to get Garage node ID."
  exit 1
fi

docker exec garage /garage -c /etc/garage/garage.toml layout assign -z dc1 -c 1G $NODE_ID
docker exec garage /garage -c /etc/garage/garage.toml layout apply --version 2
docker exec garage /garage -c /etc/garage/garage.toml key create dev-key
docker exec garage /garage -c /etc/garage/garage.toml bucket create dev-bucket
docker exec garage /garage -c /etc/garage/garage.toml bucket allow dev-bucket --read --write --owner --key dev-key
echo "Garage initialized successfully!"
