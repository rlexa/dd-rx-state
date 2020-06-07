- [Info](#Info)
- [HowTo](#Example)
- [Angular](#Angular_Quickstart)

# dd-rx-state

Redux-like state handling, but created with rxjs and allowing for less but typesafe boilerplate with typescript ([Source Code]).

## Info <a name="Info"></a>

_Note: for Angular developers check out [quickstart section](#Angular_Quickstart) further below._

Same as with Redux the global state needs to be identified and then built using actions (with unique names i.e. `type`s) and state reducers (functions which take the current state and an action and return either the same state if nothing changed or the mutated copy). The difference is that the state assembling results in an Observable stream of the state and that for static type safety the use of `Actor` is encouraged over the use of `Action` (though it is also possible to dispatch the actions directly in the store).

## Example <a name="Example"></a>

Task: a part of an UI client needs to filter, sort and show e.g. names of products.

### Identify State

Following parts are needed:

- the products are shown as list of names
- the list can be sorted
- the list can be filtered by:
  - a list of brands (or all if empty)
  - a string filter for the name (or any if empty)
  - a map of arbitrary key-value tags (or any if empty)

```typescript
interface ProductsFilter {
  brands?: string[];
  nameFilter?: string;
  tags?: {[key: string]: string};
}

export interface StateViewProducts {
  filter?: ProductsFilter;
  products?: string[];
  sortAsc?: boolean;
}
```

### Identify Actions

Identifying the actions/actors is pretty easy now that the state is clear.

Keep in mind that the `Action.type` must be unique for all actions (same as in Redux), so let's create an interfix to be used in the current state's actions to prevent accidental repeating of types.

```typescript
import {STATETAG as PARENT_STATETAG} from './state';

// ... state interfaces ...

// PARENT_STATETAG could be e.g. 'UI'
const STATETAG = PARENT_STATETAG + '_PRODUCTS';

// now let's define the actors for ProductsFilter
export const reset_filter = actor<ProductsFilter>('RESET', STATETAG, 'filter');
export const set_filter_brands = actor<string[]>('SET', STATETAG, 'filter', 'brands');
export const set_filter_nameFilter = actor<string>('SET', STATETAG, 'filter', 'nameFilter');
export const set_filter_tags = actor<{[key: string]: string}>('SET', STATETAG, 'filter', 'tags');

// and actors for StateViewProducts
export const set_products = actor<string[]>('SET', STATETAG, 'products');
export const set_sortAsc = actor<boolean>('SET', STATETAG, 'sortAsc');
```

Notice how the `StateViewProducts.filter` property does not have an actor - this state will be completely assembled from the existing `ProductsFilter` actors.

### Create State

Using the interfaces and actors the states now can be created and assembled accordingly.

```typescript
// ... state interfaces ...
// ... actors ...

export const DEFAULT_FILTER = <ProductsFilter>{brands: [], nameFilter: null, tags: {}};

const state_filter$ = initReduceAssemble$_(DEFAULT_FILTER, {
  [reset_filter.type]: redSet,
  [set_filter_brands.type]: redSetPropertyIfNotEqual_('brands'),
  [set_filter_nameFilter.type]: redSetPropertyIfNotSame_('nameFilter'),
  [set_filter_tags.type]: redSetPropertyIfNotEqual_('tags'),
});

export const state_view_products$ = initReduceAssemble$_(
  <StateViewProducts>{filter: null, products: [], sortAsc: true},
  {
    [set_products.type]: redSetPropertyIfNotEqual_('products'),
    [set_sortAsc.type]: redSetPropertyIfNotSame_('sortAsc'),
  },
  {filter: state_filter$},
);
```

And that's it - there is no more boilerplate code needed than that. Furthermore most parts are typesafe i.e. `redSetPropertyIfNotSame_` will check for the field name to actually be a key of the state type.

The assembled `state_view_products$` must now be assembled in the whatever parent state, for example:

```typescript
import {state_view_products$} from './state-products';

// top state
export interface UiState {
  viewProducts?: StateViewProducts;
}

export const state_ui$ = initReduceAssemble$_(
  <UiState>{viewProducts: null},
  null, // no own reducers
  {viewProducts: state_view_products$},
);
```

### Define `RxState`

Let's assume that `UiState` is the top state and we create the `RxState` correspondingly:

```typescript
export class RxStateUi extends RxState<UiState> {
  constructor(store: Store<State>) { super(store); }
}

...

// alternatively all of this is done via e.g. Angular injections
const rxState = new RxStateUi(createStore(state_ui$));
```

### Watch State

Now two components are to be created: `ProductsFilterComponent` and `ViewProductsComponent`.

_Note: following snippets are just samples due to unknown frontend framework._

#### ProductsFilterComponent

This component presents and mutates the filter values and sorting.

```typescript
export class ProductsFilterComponent {
  constructor(private readonly rxState: RxStateUi) {}

  // state observables - e.g. use with async in Angular HTML templates

  readonly brands$ = this.rxState.pipe(watch((state) => state.viewProducts.filter.brands));
  readonly nameFilter$ = this.rxState.pipe(watch((state) => state.viewProducts.filter.nameFilter));
  readonly tags$ = this.rxState.pipe(watch((state) => state.viewProducts.filter.tags));
  readonly sortAsc$ = this.rxState.pipe(watch((state) => state.viewProducts.sortAsc));

  // state mutators - called from HTML template

  setBrands = this.rxState.act_(set_filter_brands, orArray);
  setName = this.rxState.act_(set_filter_nameFilter, orNull);
  setTags = this.rxState.act_(set_filter_tags, orObject);
  setSortAsc = this.rxState.act_(set_sortAsc, forceBool);
  resetFilter = () => this.rxState.act(reset_filter, DEFAULT_FILTER);
}
```

_Note: in e.g. VS Code all the observables and setters show and expect the correct types._

#### ViewProductsComponent

This component shows the products and reloads the result according to filter values and sorting.

```typescript
export class ViewProductsComponent {
  constructor(private readonly rxState: RxStateUi, private readonly api: ProductsApi) {}

  private readonly done$ = new Subject();

  // state observables for reacting to

  private readonly filter$ = this.rxState.pipe(watch((state) => state.viewProducts.filter));
  private readonly sortAsc$ = this.rxState.pipe(watch((state) => state.viewProducts.sortAsc));

  // state observables - e.g. use with async in Angular HTML templates

  readonly products$ = this.rxState.pipe(watch((state) => state.viewProducts.products));

  // state mutators

  private setProducts = this.rxState.act_(set_products, orArray);

  init() {
    combineLatest(this.filter$, this.sortAsc$)
      .pipe(
        debounceTime(0),
        switchMap(([filter, sortAsc]) => this.api.httpGetProducts$(filter, sortAsc)),
        takeUntil(this.done$),
      )
      .subscribe(this.setProducts);
  }

  destroy() {
    this.done$.next();
    this.done$.complete();
  }
}
```

For not-rxjs-savvy developers; the `init()` function:

- watches the latest values from filter and sorting with `combineLatest`
- waits for a frame after any change with `debounceTime` to throttle rapid filter changes
  - i.e. to not request and cancel the api requests unnecessarily
- goes over to requesting the actual products via some api with `switchMap`
- registers cancel of this stream when `done$` is fired with `takeUntil`
  - i.e. to cancel any requests still running when component gets destroyed
- mutates the state by setting the received products
  - which will be reflected in the `products$` Observable immediately afterwards
    - which makes it very easy to separate the view part from the requesting part if desired

### Result

- Using `dd-rx-state` the state boilerplate can be held at a minimum while still providing type safety in most parts
- Using the reactive nature of the state observers the state watching can be done in just a few lines without resorting to callbacks
- Using actors it is easy to create type safe mutator functions
- Any UI components can now be destroyed and re-created and will always automatically show the last state (as it is now the only state)

# Angular Quickstart <a name="Angular_Quickstart"></a>

With typescript being the standard for Angular applications the `dd-rx-state` dependency can help to replace Redux in a more typescript friendly and typesafe way.

## Inject State

The process to initialize the state is kept in line with the Redux approach:

```typescript
// Create/Assemble some state:
export interface State { ... }
export const state$ = initReduceAssemble$_(
  <State>{ ... }, // init
  { ... }, // reducers
  { ... }); // nested states

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
      providers: [{provide: AppRxStore, useFactory: createAppRxStore}],
    });
  });
});
```

## Create Service

Just wrap `RxState` in an Angular service.

```typescript
@Injectable({providedIn: 'root'})
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

```typescript
@Component({
  selector: 'app-user-details',
  templateUrl: './user-details.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserDetailsComponent implements OnDestroy {
  constructor(private readonly rxState: RxStateService) {}

  readonly access$ = this.rxState.pipe(watch((state) => state.userInfo.access.current));
  readonly groups$ = this.rxState.pipe(watch((state) => state.userInfo.oauth.groups));
  readonly name$ = this.rxState.pipe(watch((state) => state.userInfo.oauth.name));
  readonly accessGeneralDenied$ = this.rxState.pipe(watch((state) => state.userInfo.accessGeneral <= EAccess.Unset));
  readonly accessGeneralGroupsNeeded$ = combineLatest([
    this.rxState.pipe(watch((state) => state.userInfo.generalOauthGroupsRead)),
    this.rxState.pipe(watch((state) => state.userInfo.generalOauthGroupsWrite)),
  ]).pipe(map(([reads, writes]) => [...reads, ...writes]));
}
```

## HowTo: Separate Setters from `RxStateService`

When the state grows it could be a good idea to separate the state flow process into the `RxStateService` being directly used for watching only and creating multiple setter services for state mutating.

```typescript
// Create state from reducers and actors

export class OAuthData {
  active: boolean;
}

export const set_oauth_name = actor<string>('SET_USER_oauth_active');

export const state_oauth$ = initReduceAssemble$_(<OAuthData>{active: false}, {[set_oauth_active.type]: redSetPropertyIfNotSame_('active')});

// Create a service just for mutating the UserInfo state

@Injectable({providedIn: 'root'})
export class RxStateSetUserInfoService {
  constructor(private readonly rxState: RxStateService) {}

  setOauthActive = this.rxState.act_(set_oauth_active, forceBool);
}

// Inject the mutator wherever UserInfo needs to be changed

export class UserComponent {
  constructor(private readonly rxMutateUserInfo: RxStateSetUserInfoService) {}
  logout = () => this.rxMutateUserInfo.setOauthActive(false);
}
```

## License

MIT

[source code]: https://github.com/rlexa/dd-rx-state
