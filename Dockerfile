    FROM node:24-alpine AS builder

    ARG VITE_VERTEX_API_URL
    ARG VITE_OPENAI_API_KEY
    ARG VITE_OPENAI_API_ENDPOINT
    ARG VITE_LLM_MODEL_NAME
    ARG VITE_HIDE_CHARTDB_CLOUD
    ARG VITE_DISABLE_ANALYTICS
    
    WORKDIR /usr/src/app
    
    COPY package.json package-lock.json ./
    RUN npm install
    
    COPY . .
    
    RUN echo "VITE_VERTEX_API_URL=${VITE_VERTEX_API_URL}" > .env && \
        echo "VITE_OPENAI_API_KEY=${VITE_OPENAI_API_KEY}" >> .env && \
        echo "VITE_OPENAI_API_ENDPOINT=${VITE_OPENAI_API_ENDPOINT}" >> .env && \
        echo "VITE_LLM_MODEL_NAME=${VITE_LLM_MODEL_NAME}" >> .env && \
        echo "VITE_HIDE_CHARTDB_CLOUD=${VITE_HIDE_CHARTDB_CLOUD}" >> .env && \
        echo "VITE_DISABLE_ANALYTICS=${VITE_DISABLE_ANALYTICS}" >> .env
    
    RUN npm run build
    
    FROM nginx:stable-alpine
    
    COPY --from=builder /usr/src/app/dist /usr/share/nginx/html
    
    COPY nginx.conf /etc/nginx/conf.d/default.conf
    
    EXPOSE 80
    
    CMD ["nginx", "-g", "daemon off;"]