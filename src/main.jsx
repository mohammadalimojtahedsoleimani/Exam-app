import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom';
import 'antd/dist/reset.css';
import './index.css'
import App from './App.jsx'
import {Provider} from 'react-redux';
import {store} from './redux/store';
import {ACTIVE_PARTICIPANT_STORAGE_KEY, checkpointParticipantRecovery} from './utils/participantRecovery.js';
import {APP_ROUTE} from './utils/phaseFlow.js';

// Finish an interrupted phase/session update before pages read their initial
// phase. Individual localStorage writes can be interrupted by a tab closing.
try {
    const hadRecovery = localStorage.getItem(ACTIVE_PARTICIPANT_STORAGE_KEY);
    if (!checkpointParticipantRecovery(localStorage) && hadRecovery) {
        window.history.replaceState(window.history.state, '', APP_ROUTE.SIGN_UP);
    }
} catch (error) {
    console.error('Participant recovery initialization failed:', error);
}

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <BrowserRouter>
            <Provider store={store}>
                <App/>
            </Provider>
        </BrowserRouter>
    </StrictMode>
)
