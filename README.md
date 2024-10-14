# Music Sync

Music player synchronization across multiple devices

## Requirements

- `PostgreSQL`

## Building for development

```bash
./build.sh
```

## Deployment

you need atleast docker (and/or compose) installed. required env variable

- DATABASE_URL=postgresql://user:pass@host:port/db?schema=public

```bash
docker compose up
```

