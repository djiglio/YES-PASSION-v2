import { supabase } from '../supabase.js';

export class AuthUI {
    constructor(app) {
        this.app = app;
        this.container = document.getElementById('game-content');
        this.currentUser = null;
        this.profile = null;
    }

    async checkSession() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            await this.loadProfile(session.user);
            return true;
        }
        return false;
    }

    async loadProfile(user) {
        this.currentUser = user;
        const { data, error } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', user.id)
            .single();
        
        if (data) {
            this.profile = data;
        }
    }

    async login(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            throw error;
        }

        await this.loadProfile(data.user);
        return true;
    }

    async logout() {
        await supabase.auth.signOut();
        this.currentUser = null;
        this.profile = null;
        this.render();
    }

    async updateUsername(newUsername) {
        const { error } = await supabase
            .from('profiles')
            .update({ username: newUsername })
            .eq('id', this.currentUser.id);
        
        if (!error) {
            this.profile.username = newUsername;
        }
        return error;
    }

    render() {
        this.container.innerHTML = `
            <div class="auth-container" style="max-width: 400px; margin: 5rem auto; padding: 2rem; background: var(--card-bg); border-radius: 12px; border: 1px solid var(--border-color); text-align: center;">
                <h1 style="color: var(--accent); margin-bottom: 0.5rem; font-family: 'Bebas Neue', sans-serif; font-size: 3rem;">YES PASSION</h1>
                <p style="color: var(--text-muted); margin-bottom: 2rem;">Accedi per giocare in Multiplayer</p>
                
                <form id="login-form" style="display: flex; flex-direction: column; gap: 1rem;">
                    <input type="email" id="email" placeholder="Email" required style="padding: 0.8rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.5); color: white; outline: none; font-family: inherit;">
                    <input type="password" id="password" placeholder="Password" required style="padding: 0.8rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.5); color: white; outline: none; font-family: inherit;">
                    <button type="submit" class="btn btn-primary" style="margin-top: 1rem;">Entra nel Gioco</button>
                    <div id="login-error" style="color: #ef4444; font-size: 0.9rem; margin-top: 0.5rem;"></div>
                </form>
            </div>
        `;

        const form = document.getElementById('login-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('login-error');
            
            try {
                errorDiv.textContent = 'Accesso in corso...';
                await this.login(email, password);
                // Go to Main Menu
                this.app.startHome();
            } catch (error) {
                errorDiv.textContent = 'Errore: Credenziali non valide.';
            }
        });
    }
}
