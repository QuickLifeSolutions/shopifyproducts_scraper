FROM apify/actor-node:24
COPY package*.json ./
RUN npm ci --omit=dev --no-audit
COPY . ./
CMD ["npm", "start"]
