import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { LessonPage } from './pages/LessonPage';
import { PhasePage } from './pages/PhasePage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/phase/:num" element={<PhasePage />} />
        <Route path="/lesson/:id" element={<LessonPage />} />
      </Routes>
    </BrowserRouter>
  );
}
