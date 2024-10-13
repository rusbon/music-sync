bash -c 'cd server && npm ci'
bash -c 'cd client && yarn install --frozen-lockfile'

bash -c 'cd server && tsc'
bash -c 'cd server && npx prisma migrate deploy'
cp -r server/node_modules dist/
bash -c 'cd client && npm run build'
bash test