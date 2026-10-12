FROM golang:1.26-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /reporting-service .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /reporting-service /reporting-service
EXPOSE 8080
ENTRYPOINT ["/reporting-service"]
