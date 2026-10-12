import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import RoleRoute from './components/RoleRoute.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AgentDashboard from './pages/AgentDashboard.jsx';
import AllTickets from './pages/AllTickets.jsx';
import CreateTicket from './pages/CreateTicket.jsx';
import KnowledgeBase from './pages/KnowledgeBase.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import MyTickets from './pages/MyTickets.jsx';
import NotFound from './pages/NotFound.jsx';
import Profile from './pages/Profile.jsx';
import Signup from './pages/Signup.jsx';
import TicketDetails from './pages/TicketDetails.jsx';
import Unauthorized from './pages/Unauthorized.jsx';
import UserDashboard from './pages/UserDashboard.jsx';
import UserManagement from './pages/UserManagement.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<UserDashboard />} />
          <Route path="/tickets/new" element={<CreateTicket />} />
          <Route path="/tickets" element={<MyTickets />} />
          <Route path="/tickets/:id" element={<TicketDetails />} />
          <Route path="/agent" element={<RoleRoute roles={['agent', 'admin']}><AgentDashboard /></RoleRoute>} />
          <Route path="/queue" element={<RoleRoute roles={['agent', 'admin']}><AllTickets scope="queue" /></RoleRoute>} />
          <Route path="/admin" element={<RoleRoute roles={['admin']}><AdminDashboard /></RoleRoute>} />
          <Route path="/admin/tickets" element={<RoleRoute roles={['admin']}><AllTickets scope="all" /></RoleRoute>} />
          <Route path="/admin/users" element={<RoleRoute roles={['admin']}><UserManagement /></RoleRoute>} />
          <Route path="/knowledge" element={<KnowledgeBase />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
      <Route path="/home" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
