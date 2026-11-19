# panelalpha/client-area

Edition-agnostic Client Area core: applications (Engine projects) as a given user sees them.

It defines three of the four edition contracts (`ApplicationRepository`, `AccessResolver`,
`ApplicationProvisioner`; `EngineResolver` is `panelalpha/engine-client`'s) and binds the Community answers (one user, one
Engine) as their defaults with `bindIf()` (`SingleOwnerApplicationRepository`, `SingleEngineResolver`,
`SingleUserAccessResolver`, `SingleEngineProvisioner`); a Pro/Multi edition package replaces them with `singleton()`.
Controllers, routes, sync, privileges and the Client Area's rendering of Engine failures live here and must work
unchanged in every edition; the Engine client itself is `panelalpha/engine-client` (`src/packages/engine-client`).
