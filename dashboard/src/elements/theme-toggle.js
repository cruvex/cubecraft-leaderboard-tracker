import { LitElement, css, html } from "lit";

export class ThemeToggle extends LitElement {
    static get properties() {
        return {};
    }

    firstUpdated() {
        // @ts-ignore
        super.firstUpdated();

        /** @type { HTMLInputElement }*/
        const toggleTheme = this.shadowRoot.querySelector("#themeToggle");

        const currentTheme = document.documentElement.getAttribute("theme");
        toggleTheme.checked = currentTheme === "dark";

        // sync with system changes
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", ({ matches: isDark }) => {
            const newTheme = isDark ? "dark" : "light";
            document.documentElement.setAttribute("theme", newTheme);
            localStorage.removeItem("preferred-theme");

            // Update toggle state
            if (toggleTheme) {
                toggleTheme.checked = newTheme === "dark";
            }

            console.log("System preferred theme updated to", newTheme);
        });
    }

    onClick() {
        const currentTheme = document.documentElement.getAttribute("theme");
        const newTheme = currentTheme === "light" ? "dark" : "light";
        console.log("Updated theme to", newTheme);
        document.documentElement.setAttribute("theme", newTheme);
        localStorage.setItem("preferred-theme", newTheme);
    }

    static get styles() {
        return css`
            /* From Uiverse.io by Type-Delta */
            /* a clone from joshwcomeau.com 
         * but this version runs on pure CSS
         */

            div {
                width: fit-content;
                display: flex;
                justify-content: flex-end;
            }

            .themeToggle {
                color: var(--text);
                width: 30px;
            }

            .st-sunMoonThemeToggleBtn {
                position: relative;
                cursor: pointer;
            }

            .st-sunMoonThemeToggleBtn .themeToggleInput {
                /* position: absolute; Make the input absolutely positioned */
                top: 0;
                left: 0;
                /* width: 100%; */
                height: 100%;
                opacity: 0; /* Keep it invisible */
                cursor: pointer; /* Ensure the cursor indicates it's clickable */
                margin: 0; /* Reset any default margins */
                padding: 0; /* Reset any default padding */
            }

            .st-sunMoonThemeToggleBtn svg {
                position: absolute;
                left: 0;
                width: 100%;
                height: 100%;
                transition: transform 0.4s ease, color 0.3s ease-out;
                transform: rotate(40deg);
            }

            .st-sunMoonThemeToggleBtn svg .sunMoon {
                transform-origin: center center;
                transition: inherit;
                transform: scale(1);
            }

            .st-sunMoonThemeToggleBtn svg .sunRay {
                transform-origin: center center;
                transform: scale(0);
            }

            .st-sunMoonThemeToggleBtn svg mask > circle {
                transition: transform 0.64s cubic-bezier(0.41, 0.64, 0.32, 1.575);
                transform: translate(0px, 0px);
            }

            .st-sunMoonThemeToggleBtn svg .sunRay2 {
                animation-delay: 0.05s !important;
            }
            .st-sunMoonThemeToggleBtn svg .sunRay3 {
                animation-delay: 0.1s !important;
            }
            .st-sunMoonThemeToggleBtn svg .sunRay4 {
                animation-delay: 0.17s !important;
            }
            .st-sunMoonThemeToggleBtn svg .sunRay5 {
                animation-delay: 0.25s !important;
            }
            .st-sunMoonThemeToggleBtn svg .sunRay5 {
                animation-delay: 0.29s !important;
            }

            .st-sunMoonThemeToggleBtn .themeToggleInput:checked + svg {
                transform: rotate(90deg);
            }
            .st-sunMoonThemeToggleBtn .themeToggleInput:checked + svg mask > circle {
                transform: translate(16px, -3px);
            }
            .st-sunMoonThemeToggleBtn .themeToggleInput:checked + svg .sunMoon {
                transform: scale(0.55);
            }
            .st-sunMoonThemeToggleBtn .themeToggleInput:checked + svg .sunRay {
                animation: showRay1832 0.4s ease 0s 1 forwards;
            }

            @keyframes showRay1832 {
                0% {
                    transform: scale(0);
                }
                100% {
                    transform: scale(1);
                }
            }
        `;
    }

    render() {
        return html`
            <div>
                <label for="themeToggle" class="themeToggle st-sunMoonThemeToggleBtn" type="checkbox">
                    <input @change=${this.onClick} type="checkbox" id="themeToggle" class="themeToggleInput" />
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" stroke="none">
                        <mask id="moon-mask">
                            <rect x="0" y="0" width="20" height="20" fill="white"></rect>
                            <circle cx="11" cy="3" r="8" fill="black"></circle>
                        </mask>
                        <circle class="sunMoon" cx="10" cy="10" r="8" mask="url(#moon-mask)"></circle>
                        <g>
                            <circle class="sunRay sunRay1" cx="18" cy="10" r="1.5"></circle>
                            <circle class="sunRay sunRay2" cx="14" cy="16.928" r="1.5"></circle>
                            <circle class="sunRay sunRay3" cx="6" cy="16.928" r="1.5"></circle>
                            <circle class="sunRay sunRay4" cx="2" cy="10" r="1.5"></circle>
                            <circle class="sunRay sunRay5" cx="6" cy="3.1718" r="1.5"></circle>
                            <circle class="sunRay sunRay6" cx="14" cy="3.1718" r="1.5"></circle>
                        </g>
                    </svg>
                </label>
            </div>
        `;
    }
}

customElements.define("theme-toggle", ThemeToggle);