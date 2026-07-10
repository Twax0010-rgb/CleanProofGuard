import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminSignIn } from './admin/pages/SignIn'
import { Overview } from './admin/pages/Overview'
import { Assignments } from './admin/pages/Assignments'
import { Locations } from './admin/pages/Locations'
import { LiveMap } from './admin/pages/LiveMap'
import { Staff } from './admin/pages/Staff'
import { Reports } from './admin/pages/Reports'
import { Branches } from './admin/pages/Branches'
import { Photos } from './admin/pages/Photos'
import { Users } from './admin/pages/Users'
import { Landing } from './pages/Landing'
import { VerifyArea } from './pages/VerifyArea'
import { RequireAdmin } from './routes/RequireAdmin'
import { RequireStaff } from './routes/RequireStaff'
import { StaffSignIn } from './staff/pages/SignIn'
import { MyRoute } from './staff/pages/MyRoute'
import { ScanTag } from './staff/pages/ScanTag'
import { Checklist } from './staff/pages/Checklist'
import { ProofLogged } from './staff/pages/ProofLogged'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/verify/:areaCode" element={<VerifyArea />} />

      <Route path="/staff/auth" element={<StaffSignIn />} />
      <Route
        path="/staff"
        element={
          <RequireStaff>
            <MyRoute />
          </RequireStaff>
        }
      />
      <Route
        path="/staff/scan/:assignmentId"
        element={
          <RequireStaff>
            <ScanTag />
          </RequireStaff>
        }
      />
      <Route
        path="/staff/checklist/:assignmentId"
        element={
          <RequireStaff>
            <Checklist />
          </RequireStaff>
        }
      />
      <Route
        path="/staff/proof/:assignmentId"
        element={
          <RequireStaff>
            <ProofLogged />
          </RequireStaff>
        }
      />

      <Route path="/admin/auth" element={<AdminSignIn />} />
      <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />
      <Route
        path="/admin/overview"
        element={
          <RequireAdmin feature="overview">
            <Overview />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/assignments"
        element={
          <RequireAdmin feature="assignments">
            <Assignments />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/locations"
        element={
          <RequireAdmin feature="locations">
            <Locations />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/live-map"
        element={
          <RequireAdmin feature="liveMap">
            <LiveMap />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/staff"
        element={
          <RequireAdmin feature="staff">
            <Staff />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <RequireAdmin feature="reports">
            <Reports />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/branches"
        element={
          <RequireAdmin feature="branches">
            <Branches />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/photos"
        element={
          <RequireAdmin feature="photos">
            <Photos />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/users"
        element={
          <RequireAdmin feature="users">
            <Users />
          </RequireAdmin>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
