import { Routes, Route } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { DashboardPage } from './pages/DashboardPage';
import { WorkflowsPage } from './pages/WorkflowsPage';
import { WorkflowDetailPage } from './pages/WorkflowDetailPage';
import { ExecutionsPage } from './pages/ExecutionsPage';
import { ExecutionDetailPage } from './pages/ExecutionDetailPage';

function App() {
  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route path="/workflows/:id" element={<WorkflowDetailPage />} />
        <Route path="/executions" element={<ExecutionsPage />} />
        <Route path="/executions/:id" element={<ExecutionDetailPage />} />
      </Routes>
    </MainLayout>
  );
}

export default App;
