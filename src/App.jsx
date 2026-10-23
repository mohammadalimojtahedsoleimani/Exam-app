import AppRoutes from './routes';
import {useCallback} from 'react';
import {useNavigate} from 'react-router-dom';
import {useDispatch} from 'react-redux';
import {logout} from './redux/authSlice.js';
import {APP_ROUTE} from './utils/phaseFlow.js';
import {useParticipantRecoveryExpiry} from './hooks/useParticipantRecoveryExpiry.js';
import { CloseOutlined } from '@ant-design/icons';
import { ToastContainer } from 'react-toastify';
import FullscreenProvider from './context/FullscreenProvider.jsx';
import FullscreenRestorePrompt from './components/FullscreenRestorePrompt.jsx';
import 'react-toastify/dist/ReactToastify.css';

const GLOBAL_TOAST_CONTAINER_ID = 'app-global';

const ToastCloseButton = ({ closeToast }) => (
  <button
    type="button"
    onClick={(event) => {
      event.stopPropagation();
      closeToast();
    }}
    aria-label="بستن اعلان"
    className="app-toast__close"
  >
    <CloseOutlined aria-hidden="true" />
  </button>
);

function App() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const handleRecoveryExpiry = useCallback(() => {
    dispatch(logout());
    navigate(APP_ROUTE.SIGN_UP, {replace: true});
  }, [dispatch, navigate]);
  useParticipantRecoveryExpiry(handleRecoveryExpiry);

  return (
    <FullscreenProvider>
      <ToastContainer
        containerId={GLOBAL_TOAST_CONTAINER_ID}
        position="top-center"
        autoClose={3500}
        limit={3}
        newestOnTop
        closeOnClick
        rtl
        hideProgressBar
        pauseOnFocusLoss
        draggable
        pauseOnHover
        closeButton={ToastCloseButton}
        toastClassName="app-toast"
        progressClassName="app-toast__progress"
        aria-label="اعلان‌ها"
        theme="dark"
      />
      <AppRoutes />
      <FullscreenRestorePrompt />
    </FullscreenProvider>
  );
}

export default App;
