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
            .select('username, team_name')
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

    async updateProfile(newUsername, newTeamName, newPassword) {
        // Update DB
        if (newUsername || newTeamName) {
            const updates = {};
            if (newUsername) updates.username = newUsername;
            if (newTeamName) updates.team_name = newTeamName;

            const { error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', this.currentUser.id);
            
            if (!error) {
                if (newUsername) this.profile.username = newUsername;
                if (newTeamName) this.profile.team_name = newTeamName;
            } else {
                return error;
            }
        }

        // Update Password
        if (newPassword) {
            const { error: pwdError } = await supabase.auth.updateUser({ password: newPassword });
            if (pwdError) return pwdError;
        }

        return null; // Success
    }

    async register(email, password) {
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
        });

        if (error) {
            throw error;
        }

        // Supabase returns a user object. If email confirmation is enabled, 
        // the user's identities array might be empty if the user already exists 
        // or they will need to check their email.
        if (data && data.user && data.user.identities && data.user.identities.length === 0) {
            throw new Error('UserAlreadyExists');
        }

        return data;
    }

    render() {
        this.isRegisterMode = this.isRegisterMode || false;

        this.container.innerHTML = `
            <div class="auth-container" style="max-width: 400px; margin: 5rem auto; padding: 2rem; background: var(--card-bg); border-radius: 12px; border: 1px solid var(--border-color); text-align: center;">
                <h1 style="color: var(--accent); margin-bottom: 0.5rem; font-family: 'Bebas Neue', sans-serif; font-size: 3rem;">YES PASSION</h1>
                <p style="color: var(--text-muted); margin-bottom: 2rem;">
                    ${this.isRegisterMode ? 'Crea un nuovo account per giocare' : 'Accedi per giocare in Multiplayer'}
                </p>
                
                <form id="auth-form" style="display: flex; flex-direction: column; gap: 1rem;">
                    <input type="email" id="email" placeholder="Email" required style="padding: 0.8rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.5); color: white; outline: none; font-family: inherit;">
                    <div style="position: relative;">
                        <input type="password" id="password" placeholder="Password" required style="width: 100%; padding: 0.8rem; padding-right: 2.5rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.5); color: white; outline: none; font-family: inherit;">
                        <span onclick="const x=document.getElementById('password'); x.type=x.type==='password'?'text':'password'; this.style.opacity=x.type==='password'?'0.5':'1';" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); cursor: pointer; color: white; opacity: 0.5; user-select: none; display: flex; align-items: center;" title="Mostra/Nascondi Password">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        </span>
                    </div>
                    
                    ${this.isRegisterMode ? `
                    <div style="position: relative;">
                        <input type="password" id="password-confirm" placeholder="Conferma Password" required style="width: 100%; padding: 0.8rem; padding-right: 2.5rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.5); color: white; outline: none; font-family: inherit;">
                        <span onclick="const x=document.getElementById('password-confirm'); x.type=x.type==='password'?'text':'password'; this.style.opacity=x.type==='password'?'0.5':'1';" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); cursor: pointer; color: white; opacity: 0.5; user-select: none; display: flex; align-items: center;" title="Mostra/Nascondi Password">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        </span>
                    </div>
                    ` : ''}

                    <button type="submit" class="btn btn-primary" style="margin-top: 1rem;">
                        ${this.isRegisterMode ? 'Registrati' : 'Entra nel Gioco'}
                    </button>
                    
                    <div id="auth-error" style="color: #ef4444; font-size: 0.9rem; margin-top: 0.5rem;"></div>
                    <div id="auth-success" style="color: #10b981; font-size: 0.9rem; margin-top: 0.5rem;"></div>
                </form>

                <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color); font-size: 0.9rem; color: var(--text-muted);">
                    ${this.isRegisterMode ? 'Hai già un account?' : 'Non hai un account?'} 
                    <a href="#" id="toggle-auth-mode" style="color: var(--accent); text-decoration: none; font-weight: bold;">
                        ${this.isRegisterMode ? 'Accedi' : 'Registrati'}
                    </a>
                </div>
            </div>
        `;

        document.getElementById('toggle-auth-mode').addEventListener('click', (e) => {
            e.preventDefault();
            this.isRegisterMode = !this.isRegisterMode;
            this.render();
        });

        const form = document.getElementById('auth-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('auth-error');
            const successDiv = document.getElementById('auth-success');
            
            errorDiv.textContent = '';
            successDiv.textContent = '';

            if (this.isRegisterMode) {
                const passwordConfirm = document.getElementById('password-confirm').value;
                if (password !== passwordConfirm) {
                    errorDiv.textContent = 'Le password non coincidono.';
                    return;
                }
                
                try {
                    errorDiv.textContent = 'Creazione account in corso...';
                    await this.register(email, password);
                    errorDiv.textContent = '';
                    successDiv.textContent = 'Registrazione completata! Controlla la tua email per confermare l\'account.';
                    
                    // Reset fields
                    document.getElementById('email').value = '';
                    document.getElementById('password').value = '';
                    document.getElementById('password-confirm').value = '';
                } catch (error) {
                    if (error.message === 'UserAlreadyExists' || error.status === 422) {
                        errorDiv.textContent = 'Errore: Questa email è già registrata.';
                    } else {
                        errorDiv.textContent = 'Errore durante la registrazione: ' + error.message;
                    }
                }
            } else {
                try {
                    errorDiv.textContent = 'Accesso in corso...';
                    await this.login(email, password);
                    // Go to Main Menu
                    this.app.startHome();
                } catch (error) {
                    errorDiv.textContent = 'Errore: Credenziali non valide o email non confermata.';
                }
            }
        });
    }
}
