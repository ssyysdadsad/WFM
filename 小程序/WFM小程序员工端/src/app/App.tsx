import { RouterProvider } from 'react-router';
import { router } from './routes';
import { PhoneFrame } from './components/PhoneFrame';

export default function App() {
  return (
    <PhoneFrame>
      <RouterProvider router={router} />
    </PhoneFrame>
  );
}
