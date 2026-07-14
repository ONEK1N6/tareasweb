import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import './index.css';

const CATEGORIES = {
  personal: { label: 'Personal', color: '#2dd4a0' },
  trabajo:  { label: 'Trabajo', color: '#4ab8f0' },
  salud:    { label: 'Salud', color: '#f0605d' },
  estudio:  { label: 'Estudio', color: '#f0b44a' },
  hogar:    { label: 'Hogar', color: '#c084fc' }
};

const PRIORITY_ORDER = { alta: 0, media: 1, baja: 2 };

function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentFilter, setCurrentFilter] = useState('all');
  const [currentCategory, setCurrentCategory] = useState(null);
  
  // Auth state
  const [user, setUser] = useState(null);
  
  // Sidebar mobile
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Toolbar
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created');

  // Modals
  const [taskModal, setTaskModal] = useState({ open: false, task: null });
  const [confirmModal, setConfirmModal] = useState({ open: false, type: null, targetId: null });
  const [detailModal, setDetailModal] = useState({ open: false, task: null });

  // Toasts
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchTasks(session.user.id);
      } else {
        setTasks([]);
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchTasks(session.user.id);
      } else {
        setTasks([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchTasks = async (userId) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('createdAt', { ascending: false });
    
    if (error) {
      console.error('Error fetching tasks:', error);
      showToast('Error al cargar las tareas', 'error');
    } else {
      setTasks(data || []);
    }
    setLoading(false);
  };

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });
    if (error) showToast('Error al iniciar sesión', 'error');
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) showToast('Error al cerrar sesión', 'error');
  };

  const showToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const isToday = (dateStr) => {
    if (!dateStr) return false;
    const today = new Date(); today.setHours(0,0,0,0);
    const d = new Date(dateStr + 'T00:00:00'); d.setHours(0,0,0,0);
    return d.getTime() === today.getTime();
  };

  const isOverdue = (dateStr, completed) => {
    if (!dateStr || completed) return false;
    const today = new Date(); today.setHours(0,0,0,0);
    const d = new Date(dateStr + 'T00:00:00'); d.setHours(0,0,0,0);
    return d.getTime() < today.getTime();
  };

  const getRelativeDate = (dateStr) => {
    if (!dateStr) return '';
    const today = new Date(); today.setHours(0,0,0,0);
    const d = new Date(dateStr + 'T00:00:00'); d.setHours(0,0,0,0);
    const diff = Math.round((d - today) / 86400000);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Mañana';
    if (diff === -1) return 'Ayer';
    if (diff > 1 && diff <= 7) return `En ${diff} días`;
    if (diff < -1) return `Vencida hace ${Math.abs(diff)} días`;
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const filteredTasks = useMemo(() => {
    let filtered = [...tasks];

    switch (currentFilter) {
      case 'today': filtered = filtered.filter(t => isToday(t.dueDate) && !t.completed); break;
      case 'overdue': filtered = filtered.filter(t => isOverdue(t.dueDate, t.completed)); break;
      case 'completed': filtered = filtered.filter(t => t.completed); break;
      case 'category': filtered = filtered.filter(t => t.category === currentCategory); break;
      default: break;
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(t => t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q)));
    }

    if (priorityFilter !== 'all') {
      filtered = filtered.filter(t => t.priority === priorityFilter);
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'dueDate':
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate) - new Date(b.dueDate);
        case 'priority':
          return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        case 'name':
          return a.title.localeCompare(b.title, 'es');
        default:
          return new Date(b.createdAt) - new Date(a.createdAt);
      }
    });

    if (currentFilter !== 'completed') {
      filtered.sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1));
    }

    return filtered;
  }, [tasks, currentFilter, currentCategory, searchQuery, priorityFilter, sortBy]);

  const toggleComplete = async (id, currentStatus) => {
    const newStatus = !currentStatus;
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: newStatus } : t));
    
    const { error } = await supabase
      .from('tasks')
      .update({ completed: newStatus })
      .eq('id', id)
      .eq('user_id', user.id);
      
    if (error) {
      showToast('Error al actualizar', 'error');
      setTasks(tasks.map(t => t.id === id ? { ...t, completed: currentStatus } : t));
    }
  };

  const handleDelete = (id) => {
    setConfirmModal({ open: true, type: 'single', targetId: id });
  };

  const confirmDelete = async () => {
    if (confirmModal.type === 'single') {
      const { error } = await supabase.from('tasks').delete().eq('id', confirmModal.targetId).eq('user_id', user.id);
      if (!error) {
        setTasks(tasks.filter(t => t.id !== confirmModal.targetId));
        showToast('Tarea eliminada', 'success');
      } else {
        showToast('Error al eliminar', 'error');
      }
    } else if (confirmModal.type === 'clear') {
      const { error } = await supabase.from('tasks').delete().eq('completed', true).eq('user_id', user.id);
      if (!error) {
        setTasks(tasks.filter(t => !t.completed));
        showToast('Tareas completadas eliminadas', 'success');
      } else {
        showToast('Error al limpiar', 'error');
      }
    }
    setConfirmModal({ open: false, type: null, targetId: null });
  };

  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (!user) return showToast('Debes iniciar sesión para crear tareas', 'error');
    
    const formData = new FormData(e.target);
    const title = formData.get('title').trim();
    if (!title) return showToast('El título es obligatorio', 'error');

    const newTask = {
      title,
      description: formData.get('description').trim() || null,
      priority: formData.get('priority'),
      category: formData.get('category'),
      dueDate: formData.get('dueDate') || null,
      user_id: user.id // Asignar tarea al usuario actual
    };

    if (taskModal.task) {
      // Edit
      const { data, error } = await supabase
        .from('tasks')
        .update(newTask)
        .eq('id', taskModal.task.id)
        .eq('user_id', user.id)
        .select()
        .single();
        
      if (error) {
        showToast('Error al actualizar', 'error');
      } else {
        setTasks(tasks.map(t => t.id === taskModal.task.id ? data : t));
        showToast('Tarea actualizada', 'success');
      }
    } else {
      // Create
      const { data, error } = await supabase
        .from('tasks')
        .insert([newTask])
        .select()
        .single();
        
      if (error) {
        showToast('Error al guardar', 'error');
      } else {
        setTasks([data, ...tasks]);
        showToast('Tarea creada', 'success');
      }
    }
    setTaskModal({ open: false, task: null });
  };

  // Stats calculations
  const total = tasks.length;
  const done = tasks.filter(t => t.completed).length;
  const pending = total - done;
  const todayCount = tasks.filter(t => isToday(t.dueDate) && !t.completed).length;
  const overdueCount = tasks.filter(t => isOverdue(t.dueDate, t.completed)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const titles = { all: 'Todas las tareas', today: 'Tareas de hoy', overdue: 'Tareas vencidas', completed: 'Tareas completadas' };
  const pageTitle = currentFilter === 'category' ? CATEGORIES[currentCategory]?.label : titles[currentFilter];

  return (
    <>
      <div className="bg-ambient" aria-hidden="true">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
      </div>

      <button className="mobile-toggle" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
        <i className="fas fa-bars"></i>
      </button>

      <div className="app-layout">
        {isSidebarOpen && <div className="sidebar-overlay show" onClick={() => setIsSidebarOpen(false)}></div>}
        <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
          <div className="logo">
            <div className="logo-icon"><i className="fas fa-bolt"></i></div>
            <div className="logo-text">Task<span>flow</span></div>
          </div>

          <div>
            <div className="sidebar-section-title">General</div>
            <ul className="nav-list">
              <li className={`nav-item ${currentFilter === 'all' ? 'active' : ''}`} onClick={() => { setCurrentFilter('all'); setIsSidebarOpen(false); }}>
                <i className="fas fa-layer-group"></i> Todas las tareas
                <span className="nav-badge">{total}</span>
              </li>
              <li className={`nav-item ${currentFilter === 'today' ? 'active' : ''}`} onClick={() => { setCurrentFilter('today'); setIsSidebarOpen(false); }}>
                <i className="fas fa-calendar-day"></i> Hoy
                <span className="nav-badge">{todayCount}</span>
              </li>
              <li className={`nav-item ${currentFilter === 'overdue' ? 'active' : ''}`} onClick={() => { setCurrentFilter('overdue'); setIsSidebarOpen(false); }}>
                <i className="fas fa-exclamation-circle"></i> Vencidas
                <span className="nav-badge">{overdueCount}</span>
              </li>
              <li className={`nav-item ${currentFilter === 'completed' ? 'active' : ''}`} onClick={() => { setCurrentFilter('completed'); setIsSidebarOpen(false); }}>
                <i className="fas fa-check-circle"></i> Completadas
                <span className="nav-badge">{done}</span>
              </li>
            </ul>
          </div>

          <div>
            <div className="sidebar-section-title">Categorías</div>
            <ul className="nav-list">
              {Object.entries(CATEGORIES).map(([key, cat]) => {
                const count = tasks.filter(t => t.category === key && !t.completed).length;
                return (
                  <li key={key} className={`nav-item ${currentFilter === 'category' && currentCategory === key ? 'active' : ''}`} 
                      onClick={() => { setCurrentFilter('category'); setCurrentCategory(key); setIsSidebarOpen(false); }}>
                    <span className="category-dot" style={{ background: cat.color }}></span>
                    {cat.label}
                    <span className="nav-badge">{count}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="sidebar-footer">
            {user ? (
              <>
                <div className="avatar">
                  {user.user_metadata?.avatar_url ? (
                    <img src={user.user_metadata.avatar_url} alt="User avatar" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
                  ) : (
                    user.user_metadata?.full_name?.charAt(0) || user.email?.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="user-info">
                  <div className="user-name">{user.user_metadata?.full_name || user.email.split('@')[0]}</div>
                  <div className="user-role" onClick={handleLogout} style={{ cursor: 'pointer', color: 'var(--danger)', marginTop: '4px' }}>
                    <i className="fas fa-sign-out-alt"></i> Cerrar sesión
                  </div>
                </div>
              </>
            ) : (
              <div style={{ width: '100%' }}>
                <button 
                  onClick={handleLogin} 
                  className="btn btn-ghost" 
                  style={{ width: '100%', justifyContent: 'center', borderColor: 'var(--border)', color: 'var(--fg)' }}
                >
                  <i className="fab fa-google" style={{ color: '#4285F4' }}></i> Iniciar sesión
                </button>
              </div>
            )}
          </div>
        </aside>

        <main className="main-content">
          <header className="page-header">
            <div>
              <h1 className="page-title">{pageTitle}</h1>
              <p className="page-subtitle">Gestiona tu productividad de forma eficiente</p>
            </div>
            <div className="header-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmModal({ open: true, type: 'clear' })}>
                <i className="fas fa-broom"></i> Limpiar completadas
              </button>
              <button className="btn btn-primary" onClick={() => {
                if (!user) return showToast('Por favor inicia sesión primero', 'info');
                setTaskModal({ open: true, task: null });
              }}>
                <i className="fas fa-plus"></i> Nueva tarea
              </button>
            </div>
          </header>

          <section className="stats-grid reveal visible">
            <div className="stat-card">
              <div className="stat-icon"><i className="fas fa-list-check"></i></div>
              <div className="stat-number">{total}</div>
              <div className="stat-label">Total de tareas</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><i className="fas fa-spinner"></i></div>
              <div className="stat-number">{pending}</div>
              <div className="stat-label">Pendientes</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><i className="fas fa-clock"></i></div>
              <div className="stat-number">{todayCount}</div>
              <div className="stat-label">Para hoy</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><i className="fas fa-trophy"></i></div>
              <div className="stat-number">{done}</div>
              <div className="stat-label">Completadas</div>
            </div>
          </section>

          <section className="progress-section reveal visible">
            <div className="progress-header">
              <span className="progress-label">Progreso general</span>
              <span className="progress-pct">{pct}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${pct}%` }}></div>
            </div>
          </section>

          <div className="toolbar reveal visible">
            <div className="search-box">
              <i className="fas fa-search"></i>
              <input type="text" placeholder="Buscar tareas..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <select className="filter-select" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
              <option value="all">Todas las prioridades</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
            <select className="filter-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="created">Más recientes</option>
              <option value="dueDate">Fecha de vencimiento</option>
              <option value="priority">Prioridad</option>
              <option value="name">Nombre A-Z</option>
            </select>
          </div>

          <section className="task-list">
            {!user ? (
              <div className="empty-state">
                <i className="fas fa-lock"></i>
                <h3>Inicia sesión</h3>
                <p>Por favor inicia sesión con Google para ver y crear tus tareas.</p>
              </div>
            ) : loading ? (
              <div className="empty-state">
                <i className="fas fa-spinner fa-spin"></i>
                <p>Cargando tareas...</p>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="empty-state">
                <i className="fas fa-inbox"></i>
                <h3>Sin tareas</h3>
                <p>No se encontraron tareas con estos filtros.</p>
              </div>
            ) : (
              filteredTasks.map((task) => {
                const cat = CATEGORIES[task.category];
                const overdue = isOverdue(task.dueDate, task.completed);
                return (
                  <article key={task.id} className={`task-item ${task.completed ? 'completed' : ''}`}>
                    <div className={`task-checkbox ${task.completed ? 'checked' : ''}`} onClick={() => toggleComplete(task.id, task.completed)}>
                      <i className="fas fa-check"></i>
                    </div>
                    <div className="task-body" onClick={() => setDetailModal({ open: true, task })}>
                      <div className="task-title">{task.title}</div>
                      <div className="task-meta">
                        <span className={`task-tag tag-${task.priority}`}>{task.priority}</span>
                        <span className="task-category-tag">
                          <span className="category-dot" style={{ background: cat.color }}></span>
                          {cat.label}
                        </span>
                        {task.dueDate && (
                          <span className={`task-date ${overdue ? 'overdue' : ''}`}>
                            <i className="fas fa-calendar-alt"></i> {getRelativeDate(task.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="task-actions">
                      <button className="task-action-btn" onClick={(e) => { e.stopPropagation(); setTaskModal({ open: true, task }); }}>
                        <i className="fas fa-pen"></i>
                      </button>
                      <button className="task-action-btn delete" onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }}>
                        <i className="fas fa-trash-alt"></i>
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </section>
        </main>
      </div>

      {/* Task Modal */}
      {taskModal.open && (
        <div className="modal-overlay show" onClick={() => setTaskModal({ open: false, task: null })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{taskModal.task ? 'Editar tarea' : 'Nueva tarea'}</h2>
              <button className="modal-close" onClick={() => setTaskModal({ open: false, task: null })}><i className="fas fa-times"></i></button>
            </div>
            <form onSubmit={handleSaveTask}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Título</label>
                  <input name="title" className="form-input" required defaultValue={taskModal.task?.title || ''} />
                </div>
                <div className="form-group">
                  <label className="form-label">Descripción</label>
                  <textarea name="description" className="form-textarea" defaultValue={taskModal.task?.description || ''}></textarea>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Prioridad</label>
                    <select name="priority" className="form-select" defaultValue={taskModal.task?.priority || 'media'}>
                      <option value="media">Media</option><option value="alta">Alta</option><option value="baja">Baja</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Categoría</label>
                    <select name="category" className="form-select" defaultValue={taskModal.task?.category || 'personal'}>
                      <option value="personal">Personal</option><option value="trabajo">Trabajo</option>
                      <option value="salud">Salud</option><option value="estudio">Estudio</option><option value="hogar">Hogar</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha de vencimiento</label>
                  <input type="date" name="dueDate" className="form-input" defaultValue={taskModal.task?.dueDate || ''} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setTaskModal({ open: false, task: null })}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{taskModal.task ? 'Actualizar' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal.open && (
        <div className="modal-overlay show" onClick={() => setConfirmModal({ open: false, type: null, targetId: null })}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Confirmar eliminación</h2>
              <button className="modal-close" onClick={() => setConfirmModal({ open: false, type: null, targetId: null })}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <p className="confirm-text">¿Estás seguro que deseas eliminar {confirmModal.type === 'clear' ? 'las tareas completadas' : 'esta tarea'}?</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmModal({ open: false, type: null, targetId: null })}>Cancelar</button>
              <button className="btn btn-danger" onClick={confirmDelete}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModal.open && detailModal.task && (
        <div className="modal-overlay show" onClick={() => setDetailModal({ open: false, task: null })}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{detailModal.task.title}</h2>
              <button className="modal-close" onClick={() => setDetailModal({ open: false, task: null })}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <p>{detailModal.task.description || 'Sin descripción'}</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDetailModal({ open: false, task: null })}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <i className={`fas fa-${t.type === 'success' ? 'check-circle' : t.type === 'error' ? 'exclamation-circle' : 'info-circle'} toast-icon`}></i>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default App;
