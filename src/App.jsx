import AppRoutes from './routes';
import { CloseOutlined } from '@ant-design/icons';
import { ToastContainer } from 'react-toastify';
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
  return (
    <>
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
    </>
  );
}

export default App;
