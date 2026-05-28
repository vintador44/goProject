import React from 'react';
import "../styles/sidebar.css"
import { BrowserRouter as Router, Route, useNavigate, Routes,Link } from 'react-router-dom';


class SideBarClass {

}

export type MenuItem = {
    label: string;
    path: string;
}

export const LeftSideBar: React.FC<{ menuItems: MenuItem[] }> = ({ menuItems }) => {
    return (
        
            <nav className="sidebar">
                <ul className="sidebar_tabs">
                    {menuItems.map((item, index) => (
                        <li key={index} className="sidebar_tab">
                            <Link className="sidebar_link" to={item.path}>
                                {item.label}
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>
        
    );
};




