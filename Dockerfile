# root Dockerfile is not used. Please refer to:
# - backend/Dockerfile (Node.js API)
# - docker-compose.yml (Container Orchestration)

FROM alpine:latest
CMD ["echo", "This root Dockerfile is not used. Use docker-compose up instead."]