#!/bin/bash

docker buildx build \
  --platform linux/amd64 \
  -t ghcr.io/julien040/energy-explorer-backend:latest \
  --push \
  .