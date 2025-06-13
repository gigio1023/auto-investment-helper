import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import Header from './components/Header';
import ReportsList from './components/ReportsList';
import ReportDetail from './components/ReportDetail';

function App() {
  return (
    <Router>
      <div className='min-h-screen bg-gray-50'>
        <Header />
        <main className='max-w-6xl mx-auto px-4 py-8'>
          <Routes>
            <Route path='/' element={<ReportsList />} />
            <Route path='/reports/:id' element={<ReportDetail />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
