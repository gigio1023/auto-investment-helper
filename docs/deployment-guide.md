# Deployment Guide

This document explains how to deploy the Auto Investment Helper using Docker and GitHub Actions.

## Requirements

- Docker and Docker Compose installed on the target host
- A GitHub Actions self-hosted runner (ARC) registered on that host
- Environment variables configured in an `.env` file

## Local Deployment

1. Copy `.env.example` to `.env` and adjust values for production.
2. Build and start containers:

   ```bash
   docker-compose build
   docker-compose up -d
   ```

The backend is available on port `3001`. The frontend is served on port `3000`.

## CI/CD Pipeline

The repository includes a workflow at `.github/workflows/deploy.yml`.
It runs on every push to the `main` branch and performs the following steps:

1. Checkout the repository.
2. Install backend and frontend dependencies using `npm ci`.
3. Build and start Docker containers with `docker-compose up -d --build`.

Make sure the self-hosted runner has permission to execute Docker commands.

