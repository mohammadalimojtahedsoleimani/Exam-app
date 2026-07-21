import AppRoutes from './routes';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const GLOBAL_TOAST_CONTAINER_ID = 'app-global';

const ToastCloseButton = ({ closeToast }) => (
  <button
    type="button"
    onClick={closeToast}
    aria-label="بستن اعلان"
    className="px-2 text-lg text-slate-400 transition-colors hover:text-white"
  >
    ×
  </button>
);

function App() {
  return (
    <>
      <ToastContainer
        containerId={GLOBAL_TOAST_CONTAINER_ID}
        position="top-center"
        autoClose={3500}
        newestOnTop
        closeOnClick
        rtl
        hideProgressBar
        pauseOnFocusLoss
        draggable
        pauseOnHover
        closeButton={ToastCloseButton}
        aria-label="اعلان‌ها"
        theme="dark"
      />
      <AppRoutes />
    </>
  );
}

export default App;
