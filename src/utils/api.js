// src/utils/api.js
import axios from 'axios';
import { store } from '../redux/store'; // Import store directly

const api = axios.create({
    baseURL: 'http://127.0.0.1:8000/',
});


api.interceptors.request.use(
    (config) => {

        const state = store.getState();
        const token = state.account.token;


        if (token) {

            config.headers.Authorization = `token ${token}`;
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

export default api;