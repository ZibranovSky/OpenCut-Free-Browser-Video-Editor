import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { EditorPage } from '../editor/EditorPage';
import { HomePage } from './HomePage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/editor/:id" element={<EditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
