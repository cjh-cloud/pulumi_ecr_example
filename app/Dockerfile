FROM node:16

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY . ./

RUN npm install
# if you are building your code for production
# RUN npm ci --only=production

RUN npm run build

# Bundle app source
COPY ./build .

EXPOSE 8080
CMD [ "node", "index.js" ]