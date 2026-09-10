# PressPoint Architecture Diagram

## System Architecture Flow

```mermaid
graph TB
    subgraph "Frontend Layer"
        Kiosk["🖥️ Kiosk UI<br/>(Public Touchscreen)<br/>768x1024 Portrait"]
        Dashboard["📊 Dashboard<br/>(Authenticated Staff)"]
        Auth["🔐 Auth Pages<br/>(Login, Reset)"]
    end

    subgraph "HTTP Pipeline"
        Request["HTTP Request"]
        HTTPMid["HTTP Middleware<br/>SecurityHeaders<br/>Maintenance<br/>EncryptCookies<br/>DatabaseReconnect<br/>TabSlot"]
        RouteMid["Route Middleware<br/>web, auth, admin,<br/>super_admin, throttle"]
    end

    subgraph "Application Core"
        Kernel["Kernel.py<br/>Bootstrap & Config"]
        Routes["routes/web.py<br/>Route Registry"]
        Controllers["Controllers<br/>kiosk/, gears/, auth/"]
    end

    subgraph "Business Logic Layer"
        Services["Services (Business Logic)<br/>─────────────────<br/>StorageRouter<br/>DashboardContext<br/>ArchiveServices<br/>ImageDerivatives<br/>OrgBoardTree<br/>MapWayfinderService<br/>TourScenesCatalog<br/>NewsService<br/>Notifications"]
    end

    subgraph "Data Layer"
        Models["ORM Models<br/>─────────────────<br/>News<br/>User<br/>Archives<br/>Locations<br/>Organization<br/>Member<br/>TourScenes<br/>Videos<br/>Events"]
        MySQL["MySQL Database<br/>(Production)<br/>─────────────────<br/>news, users,<br/>locations, archives,<br/>organizations,<br/>tour_scenes,<br/>notifications, etc."]
    end

    subgraph "Storage Layer - Two Roots"
        NAS["GearsNAS Mount<br/>/mnt/nas_storage/<br/>gears_data<br/>─────────────────<br/>Archives/<br/>Videos/<br/>Profiles/<br/>Branding/<br/>About/<br/>Events/"]
        LocalFS["Local Filesystem<br/>storage/framework/<br/>public<br/>─────────────────<br/>cache files<br/>compiled assets<br/>framework files"]
        StorageRouter["StorageRouter<br/>(Single Resolver)"]
    end

    subgraph "Frontend Assets"
        Webpack["webpack.mix.js<br/>(Laravel Mix)"]
        Compiled["storage/compiled/<br/>─────────────────<br/>css/<br/>js/"]
        Templates["templates/<br/>─────────────────<br/>base.html<br/>kiosk/*.html<br/>gears/dashboard.html<br/>gears/partials/"]
    end

    subgraph "Caching & Sessions"
        FileCache["File Cache<br/>(LockingFileDriver)<br/>fcntl locks for<br/>multi-process safety"]
        SessionMgr["Session Manager<br/>(SlotCookieDriver)<br/>Tab-aware slots<br/>Per-tab CSRF"]
        RateLimit["Rate Limiter<br/>GuestAuthLimiter<br/>Keyed by IP<br/>─────────────────<br/>auth: 5/min<br/>password-reset: 10/min<br/>otp: 5/min"]
    end

    subgraph "Realtime & Updates"
        Pusher["Pusher Channels<br/>Best-effort<br/>─────────────────<br/>kiosk-channel<br/>editorial<br/>flash-updates-channel"]
        Poll["Dashboard Poll<br/>every 20s<br/>─────────────────<br>/fragment/@section<br/>section_stamp()"]
    end

    subgraph "External Services"
        SMTP["SMTP Email<br/>(Password reset,<br/>notifications)"]
        nginx["nginx<br/>(Production)<br/>─────────────────<br/>Reverse proxy<br/>Serves /pano, /assets<br/>Serves NAS folders"]
        gunicorn["gunicorn<br/>(Production)<br/>─────────────────<br/>5 worker processes<br/>Unix socket"]
    end

    %% Frontend to HTTP
    Kiosk --> Request
    Dashboard --> Request
    Auth --> Request

    %% HTTP Flow
    Request --> HTTPMid
    HTTPMid --> RouteMid
    RouteMid --> Controllers

    %% App Core
    Controllers --> Kernel
    Kernel --> Routes
    Routes --> Controllers

    %% Controllers to Services
    Controllers --> Services

    %% Services to Models
    Services --> Models

    %% Models to MySQL
    Models --> MySQL

    %% Services to Storage
    Services --> StorageRouter
    StorageRouter --> NAS
    StorageRouter --> LocalFS

    %% Assets
    Controllers --> Templates
    Templates --> Compiled
    Webpack --> Compiled

    %% Caching
    Services --> FileCache
    Controllers --> SessionMgr
    Controllers --> RateLimit

    %% Realtime
    Services --> Pusher
    Dashboard --> Poll

    %% External
    Services --> SMTP
    nginx --> gunicorn
    gunicorn --> Controllers

    style Kiosk fill:#e1f5ff
    style Dashboard fill:#fff3e0
    style Services fill:#f3e5f5
    style MySQL fill:#e8f5e9
    style NAS fill:#fce4ec
    style LocalFS fill:#fce4ec
```

## Request Flow: Editing a News Story

```mermaid
graph LR
    A["Editor POST<br/>/gears/news/1"] -->|Route Match| B["NewsController@update"]
    B -->|Load User| C["LoadSlotUserMiddleware"]
    C -->|Verify CSRF| D["VerifyCsrfToken"]
    D -->|Check Admin| E["AdminMiddleware"]
    E -->|Business Logic| F["NewsService.save_story"]
    F -->|Validate & Sanitize| G["Bleach HTML<br/>Validate Status<br/>Generate Derivatives"]
    G -->|Persist| H["News Model.save"]
    H -->|Write DB| I["MySQL"]
    H -->|Broadcast| J["Pusher editorial<br/>PlayVideo"]
    H -->|Response| K["AjaxResponses<br/>JSON or Redirect"]
    K -->|Result| L["Dashboard<br/>live poll detects change<br/>via stamps"]
    L -->|Auto-refresh| M["AJAX /fragment/news-slots<br/>DashboardContext builds view"]
    M -->|Render| N["Browser updates<br/>news slots panel"]
    
    style A fill:#e1f5ff
    style F fill:#f3e5f5
    style I fill:#e8f5e9
    style N fill:#fff3e0
```

## News Composition & Placement Algorithm

```mermaid
graph TB
    A["All News Stories<br/>in Database"] --> B["group_news_slots<br/>DashboardContext"]
    B --> C{Story<br/>layout_type?}
    C -->|main| D["📌 Main Slot<br/>Position 1<br/>max 1 story<br/>lowest priority first"]
    C -->|secondary| E["📰 Secondary Slots<br/>Positions 2-5<br/>max 4 stories<br/>ordered by priority"]
    C -->|widget| F["📄 Widget Slots<br/>Positions 6-7<br/>max 2 stories<br/>ordered by priority"]
    C -->|unassigned| G["❌ Unassigned<br/>Hidden from kiosk<br/>Excluded from buckets"]
    D --> H["Kiosk Render<br/>Front page display"]
    E --> H
    F --> H
    H --> I["🖥️ Published News<br/>on Kiosk"]
    
    style D fill:#c8e6c9
    style E fill:#fff9c4
    style F fill:#ffe0b2
    style G fill:#ffccbc
    style I fill:#b3e5fc
```

## Editorial Approval Chain

```mermaid
graph LR
    A["Editor Writes<br/>Status = draft<br/>or publish-intent"] -->|Submit| B["NewsController<br/>._resolve_status"]
    B -->|Is Admin?| C{Admin Role?}
    C -->|No| D["Downgrade to<br/>review"]
    C -->|Yes| E["Keep intended<br/>status"]
    D --> F["Admin Review Panel"]
    E --> F
    F -->|Approve| G["status = published<br/>Visible on Kiosk"]
    F -->|Reject| H["status = draft<br/>rejection_reason set"]
    G --> I["_news_is_public<br/>checks 3 surfaces"]
    H --> J["Editor sees<br/>reason, resubmits"]
    J --> A
    I --> K["✅ Kiosk Display<br/>Flash Updates<br/>Lead Teaser"]
    
    style A fill:#e1f5ff
    style D fill:#ffccbc
    style G fill:#c8e6c9
    style H fill:#ffccbc
    style K fill:#b3e5fc
```

## Storage Routing Architecture

```mermaid
graph TB
    A["User/Code provides<br/>stored path"] --> B["StorageRouter<br/>.absolute_path"]
    B --> C{Path starts<br/>with NAS folder?}
    C -->|Archives/| D["GearsNAS Mount<br/>/mnt/nas_storage/<br/>gears_data/Archives/"]
    C -->|Videos/| E["GearsNAS Mount<br/>/mnt/nas_storage/<br/>gears_data/Videos/"]
    C -->|Profiles/| F["GearsNAS Mount<br/>/mnt/nas_storage/<br/>gears_data/Profiles/"]
    C -->|Branding/| G["GearsNAS Mount<br/>/mnt/nas_storage/<br/>gears_data/Branding/"]
    C -->|About/Events/| H["GearsNAS Mount<br/>/mnt/nas_storage/<br/>gears_data/(About|Events)/"]
    C -->|Other| I["Local Filesystem<br/>storage/framework/<br/>public/"]
    D --> J["Production nginx<br/>serves directly<br/>via regex location"]
    E --> J
    F --> J
    G --> J
    H --> J
    I --> K["Local cache files<br/>compiled assets"]
    J --> L["Only misses fall<br/>back to gunicorn"]
    K --> L
    L --> M["VideoController<br/>.serve_storage<br/>reads range"]
    
    style D fill:#fce4ec
    style E fill:#fce4ec
    style F fill:#fce4ec
    style G fill:#fce4ec
    style H fill:#fce4ec
    style I fill:#e0f2f1
    style J fill:#fff3e0
```

## Campus Map Coordinate System

```mermaid
graph TB
    A["Locations Table<br/>latitude, longitude<br/>(PIXEL coordinates,<br/>NOT WGS84!)"] --> B["campus-map.png<br/>1218 x 1113 px<br/>y-axis flipped"]
    B --> C["Stored in Database<br/>latitude = pixel y<br/>longitude = pixel x"]
    D["QGIS Source<br/>lspu-data.gpkg<br/>(WGS84 real coords)"] --> E["build_campus_graph.py<br/>Converts WGS84<br/>→ pixel coords"]
    E --> F["resources/geo/<br/>campus_graph.json<br/>114 nodes, 153 edges<br/>pixel space"]
    F --> G["MapWayfinderService<br/>Dijkstra routing<br/>on graph"]
    C --> H["Kiosk Render<br/>2.5D layer<br/>campus_25d.layer.js"]
    C --> I["Wayfinding<br/>Start/End points"]
    G --> J["Route path<br/>pixel coordinates"]
    I --> G
    J --> K["Kiosk Display<br/>Route overlay<br/>on map"]
    H --> K
    
    style A fill:#fff9c4
    style B fill:#fff9c4
    style D fill:#e8f5e9
    style F fill:#e8f5e9
    style K fill:#b3e5fc
    
    classDef warning fill:#ffccbc;
    class A,B warning;
```

## Virtual Tour Architecture

```mermaid
graph TB
    A["Marzipano Tool<br/>Generates export"] --> B["resources/js/data.js<br/>205 panoramic scenes<br/>Scene graph: 0-jst-1...204-jst-212<br/>3 manual edits needed"]
    C["storage/public/pano/<br/>tiles/**<br/>~360 MB imagery<br/>gitignored<br/>Serve via nginx"]
    B --> D["TourScenesCatalog<br/>.all_scenes"]
    D --> E["Kiosk Tour Page<br/>Scene drawer loop<br/>TourScenesCatalog passed<br/>by WelcomeController"]
    C --> E
    F["tour_scenes Table<br/>Maps scene_id<br/>→ location_id<br/>Display name"]
    D --> F
    F --> G["Tour Search<br/>Wayfinding Integration"]
    G --> E
    H["Deploy Steps:<br/>1. Drop new data.js<br/>2. Replace tiles/<br/>3. rsync to prod<br/>4. Delete stale rows"]
    
    style B fill:#fff9c4
    style C fill:#fce4ec
    style F fill:#e8f5e9
    style E fill:#b3e5fc
```

## Organization & Staff Directory Structure

```mermaid
graph TB
    A["Organization<br/>(Department or Student Org)<br/>kind: department|student_org"] --> B["Member[]<br/>Reporting tree<br/>parent_id (self-referencing)"]
    B --> C["User<br/>(Optional link<br/>to system account)"]
    A -->|Edit on Dashboard| D["OrgBoardEditor"]
    A -->|Display on Kiosk| E["OrgBoardTree<br/>.member_node"]
    E --> F["JSON Contract<br/>read by both:<br/>kiosk template<br/>JS editor<br/>(keys must match)"]
    D -->|Live Update| G["Kiosk Org Board<br/>Visual Chart"]
    H["Rules:<br/>- No cross-org nesting<br/>- Delete org<br/>→ CASCADE delete<br/>members (guarded)<br/>- Trees sync<br/>after fragment refresh"]
    
    style A fill:#f3e5f5
    style B fill:#f3e5f5
    style C fill:#e1f5ff
    style G fill:#b3e5fc
    style H fill:#ffccbc
```

## Multi-Process Safety: Rate Limiting & Caching

```mermaid
graph TB
    A["5 Gunicorn Processes<br/>same cache directory<br/>same MySQL"] --> B["Rate Limit Counter<br/>Attempt 1"]
    A --> C["Rate Limit Counter<br/>Attempt 2"]
    B -->|read count| D["Upstream Bug:<br/>read-modify-write<br/>WITHOUT lock"]
    C -->|read count| D
    D -->|Problem| E["Both read 3<br/>Both write 4<br/>LOST UPDATE"]
    F["Custom ThrottleRequestsMiddleware<br/>+ LockingFileDriver<br/>fcntl.flock on .lock-key<br/>Hold lock during increment"]
    G["Before increment"]
    H["After increment"]
    F --> G
    G -->|Atomic| H
    I["Process 1: lock + read 3 + write 4 + unlock"]
    J["Process 2: waits for lock<br/>read 4 + write 5<br/>No lost updates"]
    H --> I
    H --> J
    
    style E fill:#ffccbc
    style F fill:#c8e6c9
    style I fill:#c8e6c9
    style J fill:#c8e6c9
```

## Frontend Asset Pipeline

```mermaid
graph LR
    A["webpack.mix.js<br/>(Laravel Mix)"] --> B["resources/js/"]
    A --> C["resources/css/"]
    A --> D["resources/vendor/"]
    B --> E["storage/compiled/js/"]
    C --> F["storage/compiled/css/"]
    D --> G["storage/compiled/vendor/"]
    E --> H["nginx<br/>serves /assets/"]
    F --> H
    G --> H
    H --> I["templates/<br/>link by hand:<br/>&lt;link href='/assets/css/...'&gt;<br/>&lt;script src='/assets/js/...'&gt;"]
    I --> J["🖥️ Rendered Page"]
    K["⚠️ Rule:<br/>New file must be<br/>added to webpack.mix.js<br/>or it does nothing"]
    
    style K fill:#ffccbc
    style E fill:#e8f5e9
    style F fill:#e8f5e9
    style J fill:#b3e5fc
```

## PDF Archive Processing

```mermaid
graph TB
    A["Editor uploads PDF<br/>to Archives/ on NAS"] --> B["ArchiveServices<br/>PyMuPDF / fitz"]
    B --> C["Rasterize pages<br/>PAGE_RENDER_ZOOM = 1.8x"]
    C --> D["Pre-warm first 20 pages<br/>immediately<br/>generate PNG"]
    D --> E["Cache pages 21+<br/>render on demand<br/>via /archives/page"]
    E --> F["Storage layout:<br/>Archives/covers/{slug}.png<br/>Archives/pages/{slug}/page-N.png<br/>(1-indexed)"]
    F --> G["Service Worker<br/>sw-archives.js<br/>cache-first policy<br/>CACHE_NAME version"]
    G --> H["🖥️ Kiosk Archive<br/>Reader Offline cache"]
    I["Deletion Guard:<br/>Delete story<br/>→ delete derivatives<br/>or orphan forever"]
    
    style A fill:#fff9c4
    style B fill:#f3e5f5
    style F fill:#fce4ec
    style H fill:#b3e5fc
    style I fill:#ffccbc
```

## Dashboard Panel Architecture

```mermaid
graph TB
    A["templates/gears/<br/>dashboard.html<br/>~107 lines<br/>Shell only"] --> B["Dashboard Shell<br/>head, nav,<br/>shell_data, shell_js"]
    B --> C["shell_panels block<br/>6 includes, in DOM order"]
    C --> D["panel-news-composer.html<br/>Drag-drop story layout"]
    C --> E["panel-archives.html<br/>PDF upload"]
    C --> F["panel-org-board.html<br/>Org hierarchy editor"]
    C --> G["panel-tour-mapping.html<br/>Panorama links"]
    C --> H["panel-users.html<br/>Staff management"]
    C --> I["panel-other.html<br/>..."]
    A --> J["DashboardController<br/>full_context"]
    J --> K["DashboardContext<br/>builds data for all panels"]
    K --> D
    K --> E
    K --> F
    K --> G
    K --> H
    K --> I
    L["Fragment Refresh<br/>/fragment/@section"]
    L --> M["re-render same<br/>Jinja partial<br/>return via AJAX"]
    M --> N["Injected row<br/>never differs<br/>from fresh render"]
    O["⚠️ Jinja macros<br/>don't cross<br/>includes<br/>Define in one panel<br/>→ undefined in others"]
    
    style A fill:#fff3e0
    style D fill:#e1f5ff
    style K fill:#f3e5f5
    style N fill:#c8e6c9
    style O fill:#ffccbc
```

---

## Key Takeaways

1. **Two Audiences, One Codebase**: Kiosk (public) and Dashboard (staff) share all business logic via services
2. **Service Layer Pattern**: Controllers are thin; all logic in `app/services/`
3. **Single Sources of Truth**: `group_news_slots()`, `TourScenesCatalog`, `campus_graph.json` never duplicated
4. **Multi-Process Safety**: File locks on cache, connection reset on every request
5. **Storage Router**: Single resolver for two physical roots (NAS + local)
6. **Pixel Coordinates**: Campus map uses pixels, NOT WGS84 (critical!)
7. **Editorial Chain**: Editors submit → Admins approve/reject → Public visibility
8. **Dashboard Liveness**: 20s poll detects changes via stamp markers, auto-refreshes panels
9. **Fail-Closed Defaults**: Unknown status → draft, missing validation → reject
10. **Production Optimized**: nginx serves static roots directly; gunicorn handles misses only

