import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import RequireRole from './components/RequireRole'
import { api } from './lib/api'
import Home from './pages/Home'
import Discover from './pages/Discover'
import Login from './pages/Login'
import Register from './pages/Register'
import Planner from './pages/Planner'
import Bookings from './pages/Bookings'
import Compare from './pages/Compare'
import StaffLayout from './pages/staff/StaffLayout'
import StaffOverview from './pages/staff/StaffOverview'
import StaffBookings from './pages/staff/StaffBookings'
import StaffAccommodations from './pages/staff/StaffAccommodations'
import StaffSites from './pages/staff/StaffSites'
import StaffMedia from './pages/staff/StaffMedia'
import StaffRoutes from './pages/staff/StaffRoutes'
import AdminPlaces from './pages/staff/AdminPlaces'
import AdminUsers from './pages/staff/AdminUsers'
import AdminLogs from './pages/staff/AdminLogs'
import { useAuth } from './store/auth'

export default function App() {
  const token = useAuth((s) => s.token)
  const setSession = useAuth((s) => s.setSession)

  // Keep the cached profile (role, status) in sync with the server.
  useEffect(() => {
    if (!token) return
    api
      .me()
      .then((user) => setSession(token, user))
      .catch(() => {
        /* a 401 or a blocked account logs out inside the API client */
      })
  }, [token, setSession])

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="discover" element={<Discover />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route
          path="planner"
          element={
            <RequireAuth>
              <Planner />
            </RequireAuth>
          }
        />
        <Route
          path="compare"
          element={
            <RequireAuth>
              <Compare />
            </RequireAuth>
          }
        />
        <Route
          path="bookings"
          element={
            <RequireAuth>
              <Bookings />
            </RequireAuth>
          }
        />
        <Route
          path="staff"
          element={
            <RequireRole min="manager">
              <StaffLayout />
            </RequireRole>
          }
        >
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<StaffOverview />} />
          <Route path="bookings" element={<StaffBookings />} />
          <Route path="properties" element={<StaffAccommodations />} />
          <Route path="sites" element={<StaffSites />} />
          <Route path="media" element={<StaffMedia />} />
          <Route path="routes" element={<StaffRoutes />} />
          <Route
            path="places"
            element={
              <RequireRole min="admin">
                <AdminPlaces />
              </RequireRole>
            }
          />
          <Route
            path="users"
            element={
              <RequireRole min="admin">
                <AdminUsers />
              </RequireRole>
            }
          />
          <Route
            path="logs"
            element={
              <RequireRole min="admin">
                <AdminLogs />
              </RequireRole>
            }
          />
        </Route>
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  )
}