import React from 'react';
import { Routes, Route } from 'react-router-dom';

import NotFound from './pages/NotFound';
import SignUp from './pages/SignUp';
import InstructionsScreen from './pages/InstructionsScreen';
import Trial from './pages/Trial';
import FinalScreen from "./pages/FinalScreen.jsx";
import Report from './pages/Report';
import TableResults from "./pages/TableResults.jsx"
const AppRoutes = () => {
  return (


  
    <Routes>

      <Route path="/" element={<SignUp />} />  

       <Route path="/instructions" element={<InstructionsScreen />} />
        <Route path="/Final" element={<FinalScreen />} />
       <Route path ="/Trial" element={<Trial/>}/>
       <Route path ='/Report' element={<Report/>}/>
       <Route path='/results' element={<TableResults/>}/>

   
      {/* <Route path="/profile/:username" element={<Profile />} /> */}
      
      
      <Route path="*" element={<NotFound />} />
    </Routes>

  );
};

export default AppRoutes;