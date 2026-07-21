
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    token: null,

};

const authSlice = createSlice({
    name: 'account',
    initialState,
    reducers: {
        setCredentials: (state, action) => {
            const { token } = action.payload;

            state.token = token;
        },
        logout: (state) => {

            state.token = null;
        },
    },
});

export const { setCredentials, logout } = authSlice.actions;
export default authSlice.reducer;