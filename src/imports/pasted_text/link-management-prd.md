제품 요구사항 정의서 (PRD) : 링크 관리 보드 프로그램1. 프로젝트 개요 (Project Overview)1.1 제품의 한 줄 정의주제별로 보드에 링크를 저장하고, 필요 없어진 링크는 숨김(보관) 처리하거나 삭제하여 효율적으로 링크를 관리할 수 있는 '링크 관리 보드 프로그램'1.2 핵심 타겟 고객타겟 고객주요 사용 목적학술 및 연구 목적방대한 학술 자료, 논문, 레퍼런스 링크의 지속적인 서칭 및 분류 (학생 및 연구자)비즈니스 목적업체 컨택, 포트폴리오, 레퍼런스, 기사 링크 수집 (영업, 마케터, 기획자 등 직장인)일상적인 목적쇼핑 위시리스트, 여행 정보, 맛집, 레시피 등 일상 관심사 링크의 가벼운 수집 및 관리2. 권한 및 유저 정책 (Roles & Permissions)본 서비스는 별도의 '어드민(최고 관리자)' 권한을 두지 않으며, 모든 사용자는 평등한 기능을 제공받되 소속(개인/팀)에 따라 데이터 접근 권한만 철저히 분리됩니다.2.1 사용자 권한 구분사용자 권한열람 및 수정 범위제한 및 예외 사항일반 개인 멤버본인이 생성한 개인 보드와 링크타인과 '공유'된 보드이거나, 본인이 속한 '팀'의 보드에 한해서만 추가 접근 가능일반 팀 멤버본인의 개인 보드 + 본인이 소속된 팀의 보드다른 팀원의 개인 보드나, 속하지 않은 타 팀의 데이터는 절대 접근 불가어드민(관리자)해당 없음시스템 상 별도로 존재하지 않음2.2 조직 및 데이터 격리 정책완전한 데이터 격리: 개인 단위 데이터(워크스페이스)와 팀 단위 데이터는 데이터베이스 레벨에서 완전히 격리되어야 합니다.소유권 이전 및 복사 (Drag & Drop): 개인 보드에 있는 링크를 팀 보드로 드래그 앤 드롭하여 이동시킬 때, 데이터 소유권의 명확한 처리를 위해 **"팀 소유로 변경하시겠습니까?"**라는 경고창(Modal)이 노출됩니다.해당 경고창에서는 사용자가 직접 방식을 선택할 수 있도록 [팀 소유로 변경](원본을 완전히 팀으로 이동) 버튼과 [복사](개인 보드에 원본을 남기고 팀 보드에도 동일한 링크를 생성) 버튼이 제공됩니다.3. 핵심 기능 및 프로세스 (Core Features & Process)3.1 보드 관리 기능보드 생성 및 이름 지정: 사용자는 새로운 보드를 생성하고, 직관적으로 보드의 이름을 지정(및 수정)할 수 있습니다.보드 색상 지정: 보드별로 고유한 테마 색상을 지정하여 여러 보드를 시각적으로 쉽게 구분할 수 있습니다.보드 노출: 생성된 보드는 메인 화면(또는 워크스페이스)에 나열됩니다.3.2 링크 관리 기능 (UI/UX)디스플레이 (박스 형태 나열): 추가된 링크는 단순 텍스트가 아닌 **'박스 형태(카드 UI)'**로 보드 내에 나열되어 시각적인 인지가 쉬워야 합니다.미리보기(Open Graph) 실패 시 기본 정책: 링크의 썸네일 이미지를 정상적으로 불러오지 못할 경우, 서비스 로고가 중앙에 배치된 '기본 썸네일 이미지'가 노출됩니다. 이때 기본 썸네일의 배경색은 해당 링크가 속한 보드의 테마색이 자동으로 입혀져 일관된 디자인 톤을 유지합니다.인터랙션 (Drag & Drop):사용자는 링크 박스를 마우스로 드래그하여 같은 보드 내에서 순서를 변경하거나, 다른 보드로 자유롭게 이동시킬 수 있어야 합니다.링크 액션 (추가/수정/보관/삭제/가져오기):추가 및 수정: 새로운 URL을 입력하여 보드에 링크 박스를 생성합니다.링크 추가 시점 또는 이후에 **'제목'**과 **'메모'**를 작성할 수 있습니다.[중요] 제목/메모 입력은 절대 필수 사항이 아니며(선택 사항), URL만 입력해도 생성 및 저장에 제약이 없어야 합니다.(권장: Open Graph 태그를 활용해 제목/썸네일 자동 불러오기)타인 링크 가져오기 (Scrap): 타인으로부터 공유받은 보드를 열람할 때, 유용한 링크 박스를 내 개인 보드로 복사하여 가져올 수 있습니다.가져올 때 저장할 내 보드를 직접 지정할 수 있습니다.가져온 이후에는 내가 직접 추가한 링크와 동일하게 취급되며, 언제든 드래그 앤 드롭으로 타 보드 이동이 가능합니다.보관: 당장 필요하지 않지만 나중에 참고할 가능성이 있는 링크를 숨김 처리합니다.삭제: 완전히 불필요해진 링크를 지웁니다.3.3 데이터 상태 변화 흐름 (State Management)링크 데이터는 다음 3가지 상태(Status)를 가집니다.상태 (Status)노출 영역상세 정책추가됨 (Active)메인 보드 화면보드 화면에 링크 박스로 정상 노출됨보관됨 (Archived)마이페이지 > 보관된 링크메인 화면에서는 사라지며, 필요시 특정 보드로 다시 '복구(Active)' 가능삭제됨 (Deleted)없음휴지통 개념 없이 DB에서 즉시/영구적으로 **완전히 삭제(Hard Delete)**됨. 복구 불가3.4 전체 링크 통합 관리 뷰 (Table View)사용자가 저장한 모든 링크를 보드별로 찾아다닐 필요 없이, 한눈에 파악하고 관리할 수 있도록 엑셀(스프레드시트) 형태의 통합 목록 페이지를 제공합니다.표시 항목 (Columns)컬럼명설명비고제목링크의 제목선택 입력 사항메모링크에 추가한 메모 내용선택 입력 사항주제링크가 현재 속해 있는 보드(주제)의 이름링크실제 URL 주소클릭 시 해당 웹페이지로 새 창 열기작성자링크를 최초로 추가한 사용자 이름팀 보드 필수 식별 항목 (누가 수집했는지 파악)상태링크의 현재 상태Active / Archived저장일링크가 최초로 추가된 날짜 및 시간관리 편의성 (필터 및 정렬): 각 열(Column) 기준 정렬(Sorting) 기능 및 특정 보드, 상태값, 작성자만 골라보는 필터(Filtering) 기능을 제공합니다.페이징(Pagination) 처리: 방대한 양의 링크 데이터를 무한 스크롤이 아닌, 화면 하단에 페이지 번호를 제공하는 방식으로 처리하여 데이터 로딩 최적화 및 탐색의 명확성을 높입니다.3.5 공통 UI 및 사용자 설정 메뉴 (Global UI & Settings)우측 상단 프로필: 화면의 가장 오른쪽 상단에는 현재 로그인된 사용자의 프로필 사진이 동그란 형태(원형)로 상시 노출됩니다.사용자 사이드바 (Sidebar): 이 프로필 사진을 클릭하면 우측에서 슬라이드 형태로 열리는 사이드바 메뉴가 나타납니다.제공 메뉴: 계정관리, 팀관리, 피드백, 화면설정, 로그아웃 기능을 사이드바 내에서 선택할 수 있습니다.접기/닫기 기능: 사용자가 원래 화면으로 돌아갈 수 있도록, 사이드바 내부 상단에 메뉴를 다시 접어 숨길 수 있는 **닫기 버튼(X 아이콘 등)**이 제공됩니다.환경설정 페이지 이동 및 탭별 상세 기능:[계정관리] 탭: 프로필 사진 변경, 닉네임 변경, 회원탈퇴(완전 삭제 경고창 제공), 로그아웃 지원.[팀관리] 탭: * 팀 목록(체크박스, 팀이름, 팀 관리자) 조회. 새로운 팀 생성 및 팀 삭제(경고창 포함) 가능.팀원 초대 방식: 새로운 팀원을 추가할 때는 '초대용 식별 코드' 또는 **'초대 링크'**를 생성하여 팀원에게 전달/공유하는 방식을 사용합니다.[피드백] 탭:제목(필수)과 내용을 자유롭게 작성 가능.첨부파일 한계 용량: 첨부파일(JPG, PNG, PDF)은 최대 100MB 이하까지만 업로드 가능하도록 제한합니다.제출 시 개발자 이메일(haddo818@snu.ac.kr)로 전송되며, 화면 상에 개발자 이메일은 숨김 처리됩니다.[화면설정] 탭: 다크 모드, 라이트 모드 선택.3.6 전역 검색 기능 (Global Search)메인 화면 통합 검색: 사용자는 메인 화면(대시보드) 상단에 위치한 통합 검색창을 통해 자신이 접근 가능한 모든 보드의 링크를 한 번에 검색할 수 있습니다.검색 대상: 링크의 제목(Title), 메모(Memo), URL 주소 등 텍스트 데이터를 포괄하여 검색합니다.결과 제공: 검색어 입력 시, 일치하는 링크 박스들이 즉시 필터링되어 대시보드 화면에 노출되거나 직관적인 형태의 검색 결과 목록으로 표시되어 원하는 링크를 빠르게 찾을 수 있도록 돕습니다.3.7 회원가입 및 로그인 (Authentication)다중 로그인 지원: 일반적인 이메일/비밀번호 기반의 로그인뿐만 아니라, Google 소셜 로그인을 추가로 제공하여 사용자의 진입 장벽을 낮추고 편의성을 제공합니다.4. 디자인 요구사항 (Design PRD)4.1 타겟 유저 (Who)일반인용 쉬운 UI: 모바일 사용 비중이 약 50%에 달할 것으로 예상되며, 직관적이고 누르기 쉬운 버튼 배치를 선호하는 사용자 경험(UX)을 제공합니다.4.2 주요 목표 (What & Why)핵심 기능의 직관적 수행:Drag & Drop을 통한 '링크 박스'의 자유로운 이동매끄러운 팀 단위 협업 및 작업 공간 제공쉽고 빠른 링크 박스 추가 및 수정4.3 지원 디바이스 (Device)반응형 웹 디자인 (Responsive Web): 다양한 환경에 대응하는 레이아웃을 제공합니다.Desktop: 1920px (Full 해상도) / 1440px (Main 해상도 기준)Mobile: 375px ~ 430px (표준 스마트폰 해상도)4.4 주요 화면 및 기능 사항 (Features)대시보드 (Dashboard):화면 상단에 링크 전역 검색(Search Bar) 영역을 배치하여 빠른 탐색을 지원합니다.여러 보드를 한 화면에 위젯 형태로 배치합니다.링크들은 보드 내에 박스(카드) 형태로 배열됩니다.Drag & Drop 인터랙션으로 보드 간, 또는 보드 내에서 링크 박스를 손쉽게 이동시킬 수 있습니다.전체 링크 통합 관리 뷰 (Table View):전체 링크를 테이블 형태로 한눈에 조회합니다.관리 뷰 목록에서 특정 링크 박스 항목으로 즉시 이동/포커싱 할 수 있는 기능을 제공합니다.4.5 디자인 스타일 (Tone & Manner)컬러 (Color):화이트 모드(기본) 및 다크 모드 전환 기능을 지원합니다.포인트 컬러: 청록색 (#169392)타이포그래피 (Font): 프리텐다드 (Pretendard)스타일링 (Style):뉴모피즘 (Neumorphism): 빛과 그림자를 활용하여 배경과 요소가 부드럽게 이어지는 입체적인 UI 테마를 적용합니다.형태: 링크 박스는 모서리가 둥근 사각형(Rounded Rectangle, 모서리를 죽인 사각형 형태)을 유지합니다.보드 구분: 각 보드(주제)별로 미세하게 다른 배경/테마 색상을 부여하여 시각적인 구분을 명확히 합니다.5. 기술적 스펙 및 데이터베이스 가이드 (Tech Specs)5.1 백엔드 및 인프라BaaS (Backend as a Service): Supabase선정 사유 및 활용 방안: 요구사항 중 가장 중요한 **'완전한 데이터 격리'**를 구현하기 위해 Supabase의 RLS (Row Level Security) 정책을 적극 활용합니다.auth.uid()를 기반으로 개인 데이터 접근을 제어하고, 팀 테이블과 조인하여 소속된 팀의 데이터만 조회할 수 있도록 보안 규칙을 데이터베이스 단에서 설정합니다.5.2 데이터 모델 ERD 및 스키마 명세서5.2.1 ERD (Entity-Relationship Diagram)erDiagram
    USERS ||--o{ BOARDS : "creates (개인 보드)"
    USERS ||--o{ TEAM_MEMBERS : "belongs to"
    USERS ||--o{ LINKS : "adds (링크 작성)"
    TEAMS ||--o{ TEAM_MEMBERS : "has"
    TEAMS ||--o{ BOARDS : "owns (팀 보드)"
    BOARDS ||--o{ LINKS : "contains (링크 주제)"

    USERS {
        uuid id PK
        string name
        string email
        string profile_image_url "프로필 이미지"
        string auth_provider "가입 방식 (email/google)"
        string theme_preference "다크/라이트 모드"
        timestamp created_at
    }
    TEAMS {
        uuid id PK
        string name
        string invite_code "팀 초대용 식별 코드"
        timestamp created_at
    }
    TEAM_MEMBERS {
        uuid team_id FK
        uuid user_id FK
        string role "admin/member"
    }
    BOARDS {
        uuid id PK
        string name "주제 이름"
        string color "보드 테마 색상 (Hex Code)"
        uuid owner_id FK "Users (개인용)"
        uuid team_id FK "Teams (팀용)"
        timestamp created_at
    }
    LINKS {
        uuid id PK
        uuid board_id FK "링크 주제 (소속 보드)"
        uuid created_by FK "작성자 (Users)"
        string url "링크 (URL)"
        string title "링크 제목"
        text memo "링크 메모"
        string display_type "미리보기 형태 여부"
        string status "상태 (active/archived)"
        int order "정렬 순서"
        timestamp created_at "저장일"
    }
5.2.2 테이블 상세 스키마 (Table Schema Draft)1. Users Table (Supabase Auth 연동)컬럼명속성 / 제약조건설명idUUID (Primary Key)User 고유 식별자nameString사용자 이름emailString이메일profile_image_urlString프로필 이미지 URLauth_providerString계정 연동 방식 (예: email, google)theme_preferenceString화면 모드 설정값 (dark, light)created_atTimestamp계정 생성일2. Teams Table (팀 기능 지원)컬럼명속성 / 제약조건설명idUUID (Primary Key)Team 고유 식별자nameString팀 이름invite_codeString팀원 초대를 위해 발급/갱신 가능한 고유 식별 코드created_atTimestamp팀 생성일3. Team_Members Table (다대다 맵핑)컬럼명속성 / 제약조건설명team_idUUID (Foreign Key)속한 팀의 IDuser_idUUID (Foreign Key)속한 사용자의 IDroleString팀 내 권한 (팀 관리자 식별을 위한 admin 또는 member)4. Boards Table컬럼명속성 / 제약조건설명idUUID (Primary Key)Board 고유 식별자nameString보드 이름 (주제)colorString보드 배경 테마 색상owner_idUUID (Foreign Key)개인 보드일 경우 User IDteam_idUUID (Foreign Key)팀 보드일 경우 Team IDcreated_atTimestamp보드 생성일※ owner_id와 team_id 중 하나만 존재하도록 하여 완전 격리 구현5. Links Table컬럼명속성 / 제약조건설명idUUID (Primary Key)Link 고유 식별자board_idUUID (Foreign Key)소속된 보드 ID [링크 주제]created_byUUID (Foreign Key)링크를 추가한 사용자 ID [작성자] (팀 단위 필수)urlString (필수)실제 링크 주소 [링크]titleString (선택 사항)링크 제목 [링크제목]memoText (선택 사항)링크에 대한 추가 내용 [링크 메모]display_typeString노출 선택 여부 (preview 또는 url)statusString ('active'/'archived')상태값 [상태] (deleted는 Hard Delete 처리)orderInteger드래그 앤 드롭 순서 유지를 위한 정렬 인덱스created_atTimestamp (필수)링크가 추가된 타임스탬프 [저장일]