# dd-rx-state
Redux-like state handling, but created with rxjs and allowing for less but typesafe boilerplate with typescript (*for Angular developers see "Angular Quickstart" below*).

# Angular Quickstart

With typescript being the standard for Angular applications the `dd-rx-state` dependency can completely replace Redux in a similar way.

## Inject State

The process to initialize the state is kept in line with the Redux approach:

```typescript
// Create/Assemble some state:
export interface State { ... }
export const state$ = assemble$_(
  <State>{ ... },
  { ... });

// Create the injector and factory:
export const AppRxStore = new InjectionToken('App.store.rx');
export function createAppRxStore() {
  return createStore(state$);
}

// Add the factory to app.module.ts:
providers: [
  ...
  { provide: AppRxStore, useFactory: createAppRxStore },
  ...
]
```

### Tests

Don't forget to add the injector tokens in unit tests too.

```typescript
describe('test', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AppRxStore, useFactory: createAppRxStore },
      ],
    });
  });
});
```

## Create Service

Just wrap `RxState` in an Angular service.

```typescript
@Injectable({ providedIn: 'root' })
export class RxStateService extends RxState<State> implements OnDestroy {
  constructor(@Inject(AppRxStore) protected readonly store: Store<State>) {
    super(store);
  }

  ngOnDestroy() {
    this.destroy();
  }
}
```

## HowTo: Watch State

Hint: The `RxState` watchers are auto-cleaned up when not subscribed to which is why it is a good idea to provide a "takeUntil" Observable (see `done$` in the example below). This way even if (for example) the `name$ | async` part in the whatever HTML template `UserDetailsComponent` would use is scoped in an `*ngIf` clause the `name$` value would still be updated correctly when the `*ngIf` toggles between true/false.

```typescript
@Component({
  selector: 'app-user-details',
  templateUrl: './user-details.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserDetailsComponent implements OnDestroy {
  constructor(private readonly rxState: RxStateService) { }

  private readonly done$ = new Subject();

  readonly access$ = this.rxState.watch(state => state.userInfo.access.current, this.done$);
  readonly groups$ = this.rxState.watch(state => state.userInfo.oauth.groups, this.done$);
  readonly name$ = this.rxState.watch(state => state.userInfo.oauth.name, this.done$);
  readonly accessGeneralDenied$ = this.rxState.watch(state => state.userInfo.accessGeneral <= EAccess.Unset, this.done$);
  readonly accessGeneralGroupsNeeded$ = this.rxState.watch(state => [...state.userInfo.generalOauthGroupsRead, ...state.userInfo.generalOauthGroupsWrite], this.done$);

  ngOnDestroy() {
    this.done$.next();
    this.done$.complete();
  }
}
```

## HowTo: Separate Setters from `RxStateService`

When the state grows it could be a good idea to separate the state flow process into the `RxStateService` being directly used for watching only and creating multiple setter services for state mutating.

```typescript

// Create state from reducers and actors

export class OAuthData {
  active: boolean;
}

export const set_oauth_name = actor<string>('SET', 'USER', 'oauth', 'active');

export const state_oauth$ = toState$_(
  <OAuthData>{
    active: false,
  },
  reducers_({
    [set_oauth_active.type]: redSetPropertyIfNotEqual_('active'),
  }));

// Create a service just for mutating the UserInfo state

@Injectable({ providedIn: 'root' })
export class RxStateSetUserInfoService {
  constructor(private readonly rxState: RxStateService) { }
  ...
  setOauthActive = this.rxState.act_(set_oauth_active, forceBool);
  ...
}

// Inject the mutator wherever UserInfo needs to be changed

export class UserComponent {
  constructor(private readonly rxMutateUserInfo: RxStateSetUserInfoService) { }
  logout = () => this.rxMutateUserInfo.setOauthActive(false);
}
```
