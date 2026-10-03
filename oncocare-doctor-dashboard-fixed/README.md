# OncoCare+ Doctor Dashboard — Fixed Build

Independent React + Vite doctor dashboard prototype.

## Run

```powershell
cd frontend
npm install
npm run dev
```

Demo login:
- Email: `doctor@oncocare.demo`
- Password: `doctor123`

## Important

The project uses browser localStorage for its independent demo workspace. It is not a production clinical system and should not be used with real patient data without a properly secured backend, authentication, authorization, audit logging, encryption, and appropriate healthcare-data controls.

## Fix in this build

`src/pages/GenericPages.jsx` was rewritten with explicit, readable JSX structure. This resolves the Vite/Babel error:

`Adjacent JSX elements must be wrapped in an enclosing tag`.

The corrected source was syntax-checked across all `.js` and `.jsx` files before packaging.
