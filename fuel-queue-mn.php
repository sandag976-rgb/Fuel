<?php
/**
 * Plugin Name: Fuel Queue MN
 * Description: Гар утсанд зориулсан бие даасан загвартай шатахууны цахим оочир.
 * Version: 2.0.0
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Author: Fuel Queue MN
 * Text Domain: fuel-queue-mn
 */
if (!defined('ABSPATH')) { exit; }
final class FQM_App {
    const VERSION = '2.0.0';
    private $db;
    private $prefix;
    private $locked = false;
    public function __construct() {
        global $wpdb;
        $this->db = $wpdb;
        $this->prefix = $wpdb->prefix . 'fqm2_';
        add_action('template_redirect', array($this, 'render'), 0);
        add_action('admin_init', array($this, 'restrict_admin'), 0);
        add_filter('show_admin_bar', array($this, 'admin_bar'));
        add_action('admin_menu', array($this, 'menu'));
        add_action('wp_ajax_fqm_api', array($this, 'api'));
        add_action('wp_ajax_nopriv_fqm_api', array($this, 'api'));
    }
    public static function activate() {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $p = $wpdb->prefix . 'fqm2_';
        $c = $wpdb->get_charset_collate();
        $sql = array(
            "CREATE TABLE {$p}stations (
                id bigint unsigned NOT NULL AUTO_INCREMENT,
                name varchar(190) NOT NULL,
                address varchar(255) NOT NULL DEFAULT '',
                manager_id bigint unsigned NOT NULL,
                active tinyint NOT NULL DEFAULT 1,
                PRIMARY KEY  (id),
                KEY manager_id (manager_id)
            ) ENGINE=InnoDB $c;",
            "CREATE TABLE {$p}batches (
                id bigint unsigned NOT NULL AUTO_INCREMENT,
                station_id bigint unsigned NOT NULL,
                service_date date NOT NULL,
                fuel varchar(30) NOT NULL,
                capacity int unsigned NOT NULL,
                amount_limit int unsigned NOT NULL DEFAULT 0,
                open_at datetime DEFAULT NULL,
                close_at datetime DEFAULT NULL,
                status varchar(20) NOT NULL DEFAULT 'open',
                note varchar(500) NOT NULL DEFAULT '',
                created_by bigint unsigned NOT NULL,
                created_at datetime NOT NULL,
                PRIMARY KEY  (id),
                KEY station_date (station_id,service_date)
            ) ENGINE=InnoDB $c;",
            "CREATE TABLE {$p}tickets (
                id bigint unsigned NOT NULL AUTO_INCREMENT,
                batch_id bigint unsigned NOT NULL,
                queue_no int unsigned NOT NULL,
                phone varchar(8) NOT NULL,
                plate varchar(20) NOT NULL,
                status varchar(20) NOT NULL DEFAULT 'waiting',
                owner_hash char(64) NOT NULL,
                request_key varchar(80) NOT NULL,
                changed_by bigint unsigned NOT NULL DEFAULT 0,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (id),
                UNIQUE KEY request_key (request_key),
                UNIQUE KEY batch_queue (batch_id,queue_no),
                KEY batch_plate (batch_id,plate),
                KEY owner_hash (owner_hash),
                KEY status (status)
            ) ENGINE=InnoDB $c;",
            "CREATE TABLE {$p}audit (
                id bigint unsigned NOT NULL AUTO_INCREMENT,
                user_id bigint unsigned NOT NULL DEFAULT 0,
                station_id bigint unsigned NOT NULL DEFAULT 0,
                event varchar(50) NOT NULL,
                detail text NOT NULL,
                created_at datetime NOT NULL,
                PRIMARY KEY  (id),
                KEY station_id (station_id)
            ) ENGINE=InnoDB $c;",
            "CREATE TABLE {$p}rates (
                rate_key char(64) NOT NULL,
                hits int unsigned NOT NULL DEFAULT 0,
                expires bigint unsigned NOT NULL,
                PRIMARY KEY  (rate_key),
                KEY expires (expires)
            ) ENGINE=InnoDB $c;"
        );
        foreach ($sql as $s) { dbDelta($s); }
        foreach (array('stations','batches','tickets','audit','rates') as $table) {
            if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $wpdb->esc_like($p.$table))) !== $p.$table) {
                wp_die('Өгөгдлийн сангийн хүснэгт үүссэнгүй. MySQL хэрэглэгчийн CREATE эрхийг шалгана уу.');
            }
        }
        add_role('fqm_manager', 'ШТС эрхлэгч', array('read' => true));
        add_role('fqm_operator', 'ШТС түгээгч', array('read' => true));
        if (!get_option('fqm2_admin')) { update_option('fqm2_admin', get_current_user_id()); }
        $page_id = (int) get_option('fqm2_page');
        if (!$page_id || !get_post($page_id) || get_post_status($page_id) === 'trash') {
            $page_id = wp_insert_post(array('post_type'=>'page','post_status'=>'publish','post_title'=>'Шатахууны оочир','post_name'=>'fuel-queue-app','post_content'=>''), true);
            if (is_wp_error($page_id)) { wp_die('Үйлчилгээний хуудас үүссэнгүй.'); }
            update_option('fqm2_page', $page_id);
        }
        update_option('fqm2_version', self::VERSION);
    }
    private function t($name) { return $this->prefix . $name; }
    private function admin() { return get_current_user_id() > 0 && get_current_user_id() === (int)get_option('fqm2_admin') && current_user_can('manage_options'); }
    private function role() {
        if ($this->admin()) { return 'admin'; }
        $r = wp_get_current_user()->roles;
        if (in_array('fqm_manager',$r,true)) { return 'manager'; }
        if (in_array('fqm_operator',$r,true)) { return 'operator'; }
        return 'guest';
    }
    private function url() { return add_query_arg('page_id', (int)get_option('fqm2_page'), home_url('/')); }
    public function restrict_admin() {
        if (wp_doing_ajax() || (defined('DOING_CRON') && DOING_CRON)) { return; }
        if (is_user_logged_in() && !$this->admin()) { wp_safe_redirect($this->url()); exit; }
    }
    public function admin_bar($show) { return $this->admin() ? $show : false; }
    public function menu() {
        if ($this->admin()) { add_menu_page('Шатахууны оочир','Шатахууны оочир','manage_options','fuel-queue',array($this,'admin_page'),'dashicons-tickets-alt',26); }
    }
    public function admin_page() {
        if (!$this->admin()) { return; }
        echo '<div class="wrap"><h1>Шатахууны оочир · 2.0</h1><p><a class="button button-primary" href="'.esc_url($this->url()).'">Гар утасны нүүрийг нээх</a></p><p>Эрхлэгч → ШТС → Түгээгч гэсэн дарааллаар бүртгэнэ. Нэвтрэх нууц үгийг тухайн ажилтанд хувийн сувгаар өгнө.</p>';
        $this->shell(true);
        echo '</div>';
    }
    public function render() {
        $id = (int)get_option('fqm2_page');
        if (!$id || !is_page($id)) { return; }
        nocache_headers();
        header('X-Robots-Tag: noindex, nofollow', true);
        header('Referrer-Policy: same-origin');
        $this->shell(false);
        exit;
    }
    private function shell($admin) {
        $base = plugin_dir_url(__FILE__);
        $config = array('api'=>admin_url('admin-ajax.php'),'url'=>$this->url(),'adminPanel'=>$admin,'version'=>self::VERSION);
        if (!$admin) { echo '<!doctype html><html lang="mn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#123d31"><meta name="robots" content="noindex,nofollow"><title>Ээлж • Шатахууны оочир</title></head><body>'; }
        echo '<link rel="stylesheet" href="'.esc_url($base.'assets/app.css?v='.self::VERSION).'">';
        echo '<div id="fqm-root"'.($admin?' class="fqm-admin"':'').'><div class="loading"><span class="brand-mark">Э</span><p>Ээлжийг бэлтгэж байна…</p></div></div><noscript>Энэ үйлчилгээг ашиглахын тулд хөтөч дээр JavaScript-ийг идэвхжүүлнэ үү.</noscript>';
        echo '<script>window.FQM_CONFIG='.wp_json_encode($config,JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT).';</script><script src="'.esc_url($base.'assets/app.js?v='.self::VERSION).'" defer></script>';
        if (!$admin) { echo '</body></html>'; }
    }
    private function value($key,$default='') { return isset($_POST[$key]) && is_scalar($_POST[$key]) ? sanitize_text_field(wp_unslash($_POST[$key])) : $default; }
    private function fail($message,$code=400) { throw new RuntimeException($message,$code); }
    private function check_write($result) { if ($result === false) { $this->fail('Хадгалж чадсангүй. Дахин оролдоно уу.',500); } return $result; }
    private function browser() {
        $name = 'fqm_browser_'.get_current_blog_id();
        $v = isset($_COOKIE[$name]) ? $_COOKIE[$name] : '';
        if (!is_string($v) || !preg_match('/^[a-f0-9]{64}$/D',$v)) {
            $v = bin2hex(random_bytes(32));
            setcookie($name,$v,array('expires'=>time()+180*DAY_IN_SECONDS,'path'=>COOKIEPATH ? COOKIEPATH : '/','secure'=>is_ssl(),'httponly'=>true,'samesite'=>'Lax'));
            $_COOKIE[$name] = $v;
        }
        return hash_hmac('sha256',$v,wp_salt('auth'));
    }
    private function rate($type,$limit,$seconds) {
        $key = hash('sha256',$type.'|'.(isset($_SERVER['REMOTE_ADDR'])?$_SERVER['REMOTE_ADDR']:'unknown'));
        $now = time(); $t = $this->t('rates');
        $this->check_write($this->db->query($this->db->prepare("INSERT INTO $t (rate_key,hits,expires) VALUES (%s,1,%d) ON DUPLICATE KEY UPDATE hits=IF(expires<=%d,1,hits+1), expires=IF(expires<=%d,%d,expires)",$key,$now+$seconds,$now,$now,$now+$seconds)));
        if ((int)$this->db->get_var($this->db->prepare("SELECT hits FROM $t WHERE rate_key=%s",$key)) > $limit) { $this->fail('Олон удаа оролдлоо. Хэдэн минутын дараа дахин оролдоно уу.',429); }
        if (mt_rand(1,100) === 1) { $this->db->query($this->db->prepare("DELETE FROM $t WHERE expires<%d",$now)); }
    }
    private function begin() {
        $name = 'fqm2_'.substr(hash('sha256',DB_NAME.$this->prefix),0,45);
        if ((int)$this->db->get_var($this->db->prepare('SELECT GET_LOCK(%s,8)',$name)) !== 1) { $this->fail('Сервер завгүй байна. Дахин оролдоно уу.',503); }
        $this->locked = $name;
        $this->check_write($this->db->query('START TRANSACTION'));
    }
    private function release() { if ($this->locked) { $this->db->get_var($this->db->prepare('SELECT RELEASE_LOCK(%s)',$this->locked)); $this->locked = false; } }
    private function audit($event,$station,$detail) {
        $this->check_write($this->db->insert($this->t('audit'),array('user_id'=>get_current_user_id(),'station_id'=>$station,'event'=>$event,'detail'=>$detail,'created_at'=>current_time('mysql'))));
    }
    private function station($id,$manage=false) {
        $s = $this->db->get_row($this->db->prepare('SELECT * FROM '.$this->t('stations').' WHERE id=%d',$id),ARRAY_A);
        if (!$s) { $this->fail('ШТС олдсонгүй.',404); }
        if ($this->admin()) { return $s; }
        $uid = get_current_user_id(); $role = $this->role();
        if ($role === 'manager' && (int)$s['manager_id'] === $uid) { return $s; }
        if (!$manage && $role === 'operator' && (int)$s['manager_id'] === (int)get_user_meta($uid,'fqm_manager',true) && in_array((int)$id,array_map('intval',(array)get_user_meta($uid,'fqm_stations',true)),true)) { return $s; }
        $this->fail('Энэ ШТС-д ажиллах эрхгүй.',403);
    }
    private function batch($id,$manage=false) {
        $b = $this->db->get_row($this->db->prepare('SELECT * FROM '.$this->t('batches').' WHERE id=%d',$id),ARRAY_A);
        if (!$b) { $this->fail('Оочир олдсонгүй.',404); }
        $this->station($b['station_id'],$manage);
        return $b;
    }
    private function available($b) {
        $now = current_time('mysql');
        return $b['status']==='open' && $b['service_date']>=substr($now,0,10) && (!$b['open_at'] || $b['open_at']<=$now) && (!$b['close_at'] || $b['close_at']>=$now);
    }
    private function policy($manager) { return get_user_meta($manager,'fqm_policy',true)==='per_station' ? 'per_station' : 'one'; }
    private function now() { return current_time('mysql'); }
    public function api() {
        nocache_headers();
        header('Referrer-Policy: same-origin');
        $result = null; $error = null;
        try {
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $this->fail('POST хүсэлт шаардлагатай.',405); }
            if (!empty($_SERVER['HTTP_ORIGIN'])) {
                $origin = wp_parse_url($_SERVER['HTTP_ORIGIN']);
                $site = wp_parse_url(home_url('/'));
                if (!$origin || !$site || strtolower(isset($origin['host'])?$origin['host']:'') !== strtolower($site['host']) || (isset($origin['port'])?$origin['port']:null) !== (isset($site['port'])?$site['port']:null)) { $this->fail('Өөр сайтаас илгээсэн хүсэлт зөвшөөрөхгүй.',403); }
            }
            $browser = $this->browser();
            $op = $this->value('op');
            if ($op !== 'boot' && !wp_verify_nonce($this->value('nonce'),'fqm2_'.$browser)) { $this->fail('Хуудасны хугацаа дууслаа. Шинэчлээд дахин оролдоно уу.',403); }
            if ($op === 'boot') {
                $role=$this->role();
                $result=array('nonce'=>wp_create_nonce('fqm2_'.$browser),'role'=>$role,'name'=>wp_get_current_user()->display_name,'today'=>wp_date('Y-m-d'),'adminUrl'=>$this->admin()?admin_url('admin.php?page=fuel-queue'):'','policy'=>$this->policy(get_current_user_id()));
            } elseif ($op === 'login') {
                $this->rate('login',12,300);
                $user=wp_signon(array('user_login'=>$this->value('login'),'user_password'=>isset($_POST['password'])&&is_string($_POST['password'])?wp_unslash($_POST['password']):'','remember'=>false),is_ssl());
                if (is_wp_error($user)) { $this->fail('Нэвтрэх нэр эсвэл нууц үг буруу.',401); }
                wp_set_current_user($user->ID);
                if ($this->role()==='guest') { wp_logout(); $this->fail('Ажилтны эрх оноогдоогүй байна.',403); }
                $result=array('ok'=>true);
            } elseif ($op === 'logout') {
                wp_logout(); $result=array('ok'=>true);
            } elseif ($op === 'public') {
                $result=$this->public_data();
            } elseif ($op === 'mine') {
                $result=$this->my_tickets($browser);
            } elseif ($op === 'workspace') {
                $result=$this->workspace();
            } else {
                if (in_array($op,array('book','cancel'),true)) { $this->rate($op,30,300); }
                $this->begin();
                switch ($op) {
                    case 'book': $result=$this->book($browser); break;
                    case 'cancel': $result=$this->cancel($browser); break;
                    case 'serve': $result=$this->serve(); break;
                    case 'undo': $result=$this->undo(); break;
                    case 'save_batch': $result=$this->save_batch(); break;
                    case 'batch_state': $result=$this->batch_state(); break;
                    case 'save_station': $result=$this->save_station(); break;
                    case 'save_user': $result=$this->save_user(); break;
                    case 'policy': $result=$this->save_policy(); break;
                    default: $this->fail('Үйлдэл олдсонгүй.',404);
                }
                $this->check_write($this->db->query('COMMIT'));
            }
        } catch (Throwable $e) {
            if ($this->locked) { $this->db->query('ROLLBACK'); }
            $code=$e instanceof RuntimeException ? $e->getCode() : 500;
            $error=array('message'=>$e instanceof RuntimeException?$e->getMessage():'Серверийн алдаа гарлаа. Админд мэдэгдэнэ үү.','code'=>$code>=400 && $code<=599?$code:500);
        } finally { $this->release(); }
        if ($error) { wp_send_json_error(array('message'=>$error['message']),$error['code']); }
        wp_send_json_success($result);
    }
    private function public_data() {
        $s=$this->t('stations'); $b=$this->t('batches'); $q=$this->t('tickets');
        $rows=$this->db->get_results($this->db->prepare("SELECT b.*, s.name AS station_name,s.address,s.manager_id,(SELECT COUNT(*) FROM $q q WHERE q.batch_id=b.id AND q.status<>'cancelled') AS used FROM $b b JOIN $s s ON s.id=b.station_id WHERE s.active=1 AND b.service_date>=%s AND b.status IN ('open','paused') ORDER BY b.service_date,b.id",wp_date('Y-m-d')),ARRAY_A);
        foreach ($rows as &$r) { $r['available']=$this->available($r); $r['left']=max(0,(int)$r['capacity']-(int)$r['used']); unset($r['created_by'],$r['manager_id']); }
        return $rows;
    }
    private function my_tickets($browser) {
        $q=$this->t('tickets'); $b=$this->t('batches'); $s=$this->t('stations');
        return $this->db->get_results($this->db->prepare("SELECT q.id,q.queue_no,q.plate,q.status,q.created_at,b.service_date,b.fuel,b.amount_limit,b.status AS batch_status,b.note,s.name AS station_name,s.address,(SELECT COUNT(*) FROM $q a WHERE a.batch_id=q.batch_id AND a.status='waiting' AND a.queue_no<q.queue_no) AS ahead,(SELECT MIN(a.queue_no) FROM $q a WHERE a.batch_id=q.batch_id AND a.status='waiting') AS current_no FROM $q q JOIN $b b ON b.id=q.batch_id JOIN $s s ON s.id=b.station_id WHERE q.owner_hash=%s ORDER BY q.id DESC LIMIT 50",$browser),ARRAY_A);
    }
    private function book($browser) {
        $key=$this->value('request_key');
        if (!preg_match('/^[a-zA-Z0-9_-]{16,80}$/D',$key)) { $this->fail('Хүсэлтийн дугаар буруу байна. Хуудсаа шинэчилнэ үү.'); }
        $request=hash('sha256',$browser.$key);
        $q=$this->t('tickets'); $bt=$this->t('batches'); $st=$this->t('stations');
        $old=$this->db->get_row($this->db->prepare("SELECT id,queue_no FROM $q WHERE request_key=%s",$request),ARRAY_A);
        if ($old) { return $old; }
        $id=absint($this->value('batch_id'));
        $b=$this->db->get_row($this->db->prepare("SELECT b.*,s.active,s.manager_id FROM $bt b JOIN $st s ON s.id=b.station_id WHERE b.id=%d FOR UPDATE",$id),ARRAY_A);
        if (!$b || !$b['active'] || !$this->available($b)) { $this->fail('Энэ оочир захиалга авахгүй байна. Нүүрээ шинэчилнэ үү.'); }
        $phone=preg_replace('/[\s-]+/','',$this->value('phone'));
        $plate=strtoupper(strtr($this->value('plate'),array_combine(preg_split('//u','абвгдеёжзийклмнопрстуфхцчшщъыьэюяөү',-1,PREG_SPLIT_NO_EMPTY),preg_split('//u','АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯӨҮ',-1,PREG_SPLIT_NO_EMPTY))));
        $plate=preg_replace('/[\s-]+/u','',$plate);
        if (!preg_match('/^[0-9]{8}$/D',$phone)) { $this->fail('Утасны дугаараа 8 оронтой оруулна уу.'); }
        if (!preg_match('/^[0-9]{4}[А-ЯӨҮЁ]{3}$/uD',$plate)) { $this->fail('Машины дугаарыг 1234ЗАН хэлбэрээр, кирилл үсгээр оруулна уу.'); }
        $same=(int)$this->db->get_var($this->db->prepare("SELECT COUNT(*) FROM $q WHERE batch_id=%d AND plate=%s AND status<>'cancelled'",$id,$plate));
        if ($same) { $this->fail('Энэ машин уг оочирт бүртгэгдсэн байна.'); }
        $global=(bool)get_option('fqm2_global_one',false);
        $others=$this->db->get_results($this->db->prepare("SELECT b.station_id,s.manager_id FROM $q q JOIN $bt b ON b.id=q.batch_id JOIN $st s ON s.id=b.station_id WHERE q.plate=%s AND b.service_date=%s AND q.status<>'cancelled'",$plate,$b['service_date']),ARRAY_A);
        foreach ($others as $o) {
            if ($global || ((int)$o['manager_id']===(int)$b['manager_id'] && ($this->policy($b['manager_id'])==='one' || (int)$o['station_id']===(int)$b['station_id']))) { $this->fail('Энэ машин сонгосон өдөрт зөвшөөрөгдөх оочроо авсан байна.'); }
        }
        $used=(int)$this->db->get_var($this->db->prepare("SELECT COUNT(*) FROM $q WHERE batch_id=%d AND status<>'cancelled'",$id));
        if ($used>=(int)$b['capacity']) { $this->fail('Оочир дүүрсэн байна. Өөр ШТС сонгоно уу.'); }
        $number=1+(int)$this->db->get_var($this->db->prepare("SELECT MAX(queue_no) FROM $q WHERE batch_id=%d",$id));
        $this->check_write($this->db->insert($q,array('batch_id'=>$id,'queue_no'=>$number,'phone'=>$phone,'plate'=>$plate,'status'=>'waiting','owner_hash'=>$browser,'request_key'=>$request,'created_at'=>$this->now(),'updated_at'=>$this->now())));
        $ticket=$this->db->insert_id;
        $this->audit('book',$b['station_id'],'Оочир #'.$id.' · тасалбар #'.$ticket);
        return array('id'=>$ticket,'queue_no'=>$number);
    }
    private function cancel($browser) {
        $q=$this->t('tickets');
        $t=$this->db->get_row($this->db->prepare("SELECT * FROM $q WHERE id=%d AND owner_hash=%s",absint($this->value('id')),$browser),ARRAY_A);
        if (!$t) { $this->fail('Захиалга олдсонгүй.',404); }
        if ($t['status']==='cancelled') { return array('ok'=>true); }
        if ($t['status']!=='waiting') { $this->fail('Энэ захиалгыг цуцлах боломжгүй.'); }
        $this->check_write($this->db->update($q,array('status'=>'cancelled','updated_at'=>$this->now(),'changed_by'=>0),array('id'=>$t['id'])));
        $sid=(int)$this->db->get_var($this->db->prepare('SELECT station_id FROM '.$this->t('batches').' WHERE id=%d',$t['batch_id']));
        $this->audit('cancel',$sid,'Тасалбар #'.$t['id']);
        return array('ok'=>true);
    }
    private function workspace() {
        $role=$this->role(); $uid=get_current_user_id();
        if ($role==='guest') { $this->fail('Ажилтнаар нэвтэрнэ үү.',403); }
        $s=$this->t('stations'); $b=$this->t('batches'); $q=$this->t('tickets');
        $all=$this->db->get_results("SELECT * FROM $s ORDER BY name",ARRAY_A); $stations=array();
        foreach ($all as $row) { try { $this->station($row['id']); $stations[]=$row; } catch (RuntimeException $e) {} }
        $ids=array_column($stations,'id'); $in=$ids?implode(',',array_map('intval',$ids)):'0';
        $batches=$this->db->get_results("SELECT b.*,s.name AS station_name,(SELECT COUNT(*) FROM $q q WHERE q.batch_id=b.id AND q.status<>'cancelled') AS used,(SELECT COUNT(*) FROM $q q WHERE q.batch_id=b.id AND q.status='waiting') AS waiting,(SELECT COUNT(*) FROM $q q WHERE q.batch_id=b.id AND q.status='served') AS served FROM $b b JOIN $s s ON s.id=b.station_id WHERE b.station_id IN ($in) ORDER BY b.service_date DESC,b.id DESC LIMIT 150",ARRAY_A);
        $tickets=array(); $bid=absint($this->value('batch_id'));
        if ($bid) { $this->batch($bid); $tickets=$this->db->get_results($this->db->prepare("SELECT id,queue_no,plate,phone,status,updated_at,changed_by FROM $q WHERE batch_id=%d AND status<>'cancelled' ORDER BY queue_no LIMIT 10000",$bid),ARRAY_A); }
        $users=array();
        if ($role!=='operator') {
            $found=get_users(array('role__in'=>array('fqm_manager','fqm_operator'),'number'=>1000));
            foreach ($found as $u) {
                $manager=(int)get_user_meta($u->ID,'fqm_manager',true);
                if ($role==='manager' && ($manager!==$uid || !in_array('fqm_operator',$u->roles,true))) { continue; }
                $users[]=array('id'=>$u->ID,'name'=>$u->display_name,'login'=>$u->user_login,'role'=>in_array('fqm_manager',$u->roles,true)?'manager':'operator','manager_id'=>$manager,'stations'=>array_map('intval',(array)get_user_meta($u->ID,'fqm_stations',true)));
            }
        }
        $logs=$role!=='operator'?$this->db->get_results("SELECT a.*,u.display_name AS actor FROM ".$this->t('audit')." a LEFT JOIN {$this->db->users} u ON u.ID=a.user_id WHERE a.station_id IN ($in)".($this->admin()?' OR a.station_id=0':$this->db->prepare(' OR a.user_id=%d',$uid))." ORDER BY a.id DESC LIMIT 60",ARRAY_A):array();
        return array('stations'=>$stations,'batches'=>$batches,'tickets'=>$tickets,'users'=>$users,'logs'=>$logs,'global_one'=>(bool)get_option('fqm2_global_one',false),'policy'=>$this->policy($uid),'uid'=>$uid);
    }
    private function serve() {
        $id=absint($this->value('id')); $q=$this->t('tickets');
        $t=$this->db->get_row($this->db->prepare("SELECT * FROM $q WHERE id=%d",$id),ARRAY_A);
        if (!$t) { $this->fail('Захиалга олдсонгүй.',404); }
        $b=$this->batch($t['batch_id']);
        $s=$this->station($b['station_id']);
        if (!$s['active'] || $b['status']!=='open' || $b['service_date']!==wp_date('Y-m-d')) { $this->fail('Зөвхөн өнөөдрийн нээлттэй оочирт үйлчилнэ.'); }
        $status=$this->value('status');
        if (!in_array($status,array('served','missed'),true)) { $this->fail('Төлөв буруу байна.'); }
        $next=(int)$this->db->get_var($this->db->prepare("SELECT MIN(queue_no) FROM $q WHERE batch_id=%d AND status='waiting'",$t['batch_id']));
        if ($t['status']!=='waiting' || (int)$t['queue_no']!==$next) { $this->fail('Дараалал өөрчлөгдсөн байна. Дахин шинэчилнэ үү.'); }
        $this->check_write($this->db->update($q,array('status'=>$status,'changed_by'=>get_current_user_id(),'updated_at'=>$this->now()),array('id'=>$id)));
        $this->audit($status,$b['station_id'],'Тасалбар #'.$id.' · №'.$t['queue_no']);
        return array('ok'=>true,'undo_id'=>$id);
    }
    private function undo() {
        $id=absint($this->value('id')); $q=$this->t('tickets');
        $t=$this->db->get_row($this->db->prepare("SELECT * FROM $q WHERE id=%d",$id),ARRAY_A);
        if (!$t) { $this->fail('Захиалга олдсонгүй.',404); }
        $b=$this->batch($t['batch_id']);
        $changed=DateTimeImmutable::createFromFormat('Y-m-d H:i:s',$t['updated_at'],wp_timezone());
        if (!in_array($t['status'],array('served','missed'),true) || (int)$t['changed_by']!==get_current_user_id() || !$changed || time()-$changed->getTimestamp()>30) { $this->fail('Буцаах 30 секундын хугацаа дууссан.'); }
        $this->check_write($this->db->update($q,array('status'=>'waiting','updated_at'=>$this->now()),array('id'=>$id)));
        $this->audit('undo',$b['station_id'],'Тасалбар #'.$id);
        return array('ok'=>true);
    }
    private function date_value($v,$time=false) {
        if ($v==='' && $time) { return null; }
        $format=$time?'Y-m-d\TH:i':'Y-m-d';
        $d=DateTimeImmutable::createFromFormat('!'.$format,$v,wp_timezone());
        if (!$d || $d->format($format)!==$v) { $this->fail('Огноо, цагаа зөв оруулна уу.'); }
        return $d->format($time?'Y-m-d H:i:s':'Y-m-d');
    }
    private function save_batch() {
        $sid=absint($this->value('station_id')); $this->station($sid,true);
        $id=absint($this->value('id')); $old=$id?$this->batch($id,true):null;
        if ($old && (int)$old['station_id']!==$sid) { $this->fail('Оочрын ШТС-ыг солих боломжгүй. Хуулж шинээр үүсгэнэ үү.'); }
        $date=$this->date_value($this->value('service_date'));
        if ($date<wp_date('Y-m-d')) { $this->fail('Өнгөрсөн өдөр оочир үүсгэх боломжгүй.'); }
        $fuel=$this->value('fuel');
        if (!in_array($fuel,array('АИ-92','АИ-95','АИ-98','Дизель','Газ'),true)) { $this->fail('Шатахууны төрөл сонгоно уу.'); }
        $capacity=(int)$this->value('capacity'); $limit=(int)$this->value('amount_limit');
        if ($capacity<1 || $capacity>10000 || $limit<0 || $limit>10000000) { $this->fail('Машины тоо 1–10000, лимит 0–10000000₮ байна.'); }
        $open=$this->date_value($this->value('open_at'),true); $close=$this->date_value($this->value('close_at'),true);
        if (($open && substr($open,0,10)>$date) || ($close && substr($close,0,10)>$date) || ($open && $close && $open>=$close)) { $this->fail('Бүртгэлийн нээх/хаах цаг болон үйлчлэх өдрийг шалгана уу.'); }
        $used=$id?(int)$this->db->get_var($this->db->prepare('SELECT COUNT(*) FROM '.$this->t('tickets')." WHERE batch_id=%d AND status<>'cancelled'",$id)):0;
        if ($capacity<$used) { $this->fail('Машины тоог бүртгүүлсэн '.$used.' машинаас багасгаж болохгүй.'); }
        if ($used && ($old['service_date']!==$date || $old['fuel']!==$fuel || (int)$old['amount_limit']!==$limit)) { $this->fail('Хүн бүртгүүлсэн оочрын өдөр, шатахуун, лимитийг солихгүй. Хуулж шинэ оочир үүсгэнэ үү.'); }
        $duplicate=$this->db->get_var($this->db->prepare('SELECT id FROM '.$this->t('batches')." WHERE station_id=%d AND service_date=%s AND fuel=%s AND status<>'closed' AND id<>%d",$sid,$date,$fuel,$id));
        if ($duplicate) { $this->fail('Энэ өдөр, шатахууны төрлөөр оочир үүссэн байна. Түүнийг засах эсвэл хаана уу.'); }
        $data=array('station_id'=>$sid,'service_date'=>$date,'fuel'=>$fuel,'capacity'=>$capacity,'amount_limit'=>$limit,'open_at'=>$open,'close_at'=>$close,'note'=>$this->value('note'));
        if ($id) { $this->check_write($this->db->update($this->t('batches'),$data,array('id'=>$id))); }
        else { $data['status']='open'; $data['created_by']=get_current_user_id(); $data['created_at']=$this->now(); $this->check_write($this->db->insert($this->t('batches'),$data)); $id=$this->db->insert_id; }
        $this->audit($old?'edit_batch':'create_batch',$sid,'Оочир #'.$id.' · '.$date.' · '.$fuel);
        return array('id'=>$id);
    }
    private function batch_state() {
        $id=absint($this->value('id')); $b=$this->batch($id,true); $status=$this->value('status');
        if (!in_array($status,array('open','paused','closed'),true)) { $this->fail('Төлөв буруу.'); }
        if ($status!=='closed') {
            $conflict=$this->db->get_var($this->db->prepare('SELECT id FROM '.$this->t('batches')." WHERE station_id=%d AND service_date=%s AND fuel=%s AND status<>'closed' AND id<>%d",$b['station_id'],$b['service_date'],$b['fuel'],$id));
            if ($conflict) { $this->fail('Ижил өдөр, шатахуунтай өөр оочир нээлттэй байна.'); }
        }
        $note=$this->value('note');
        if ($status==='paused' && $note==='') { $this->fail('Түр зогсоох шалтгаанаа бичнэ үү.'); }
        $this->check_write($this->db->update($this->t('batches'),array('status'=>$status,'note'=>$note),array('id'=>$id)));
        $this->audit('batch_'.$status,$b['station_id'],'Оочир #'.$id.' · '.$note);
        return array('ok'=>true);
    }
    private function save_station() {
        if (!$this->admin()) { $this->fail('Зөвхөн админ ШТС бүртгэнэ.',403); }
        $id=absint($this->value('id')); $manager=absint($this->value('manager_id')); $name=$this->value('name'); $u=get_userdata($manager);
        if (!$name || !$u || !in_array('fqm_manager',$u->roles,true)) { $this->fail('ШТС-ын нэр, хариуцах эрхлэгчийг сонгоно уу.'); }
        $active=$this->value('active','1')==='1'?1:0;
        if ($id) {
            $old=$this->station($id,true);
            if ((int)$old['manager_id']!==$manager || !$active) {
                $waiting=$this->db->get_var($this->db->prepare('SELECT COUNT(*) FROM '.$this->t('tickets').' q JOIN '.$this->t('batches')." b ON b.id=q.batch_id WHERE b.station_id=%d AND q.status='waiting'",$id));
                if ($waiting) { $this->fail('Хүлээгдэж буй захиалгуудыг шийдвэрлэсний дараа эрхлэгч солих эсвэл ШТС идэвхгүй болгоно уу.'); }
            }
        }
        $data=array('name'=>$name,'address'=>$this->value('address'),'manager_id'=>$manager,'active'=>$active);
        if ($id) { $this->check_write($this->db->update($this->t('stations'),$data,array('id'=>$id))); }
        else { $this->check_write($this->db->insert($this->t('stations'),$data)); $id=$this->db->insert_id; }
        $this->audit('save_station',$id,$name.' · эрхлэгч #'.$manager);
        return array('id'=>$id);
    }
    private function save_user() {
        $role=$this->role();
        if (!in_array($role,array('admin','manager'),true)) { $this->fail('Ажилтан бүртгэх эрхгүй.',403); }
        $target=$this->value('role','operator');
        if (!in_array($target,array('manager','operator'),true) || ($target==='manager' && !$this->admin())) { $this->fail('Энэ эрхийг олгох боломжгүй.',403); }
        $manager=$this->admin()?absint($this->value('manager_id')):get_current_user_id();
        $ids=isset($_POST['stations']) && is_array($_POST['stations'])?array_values(array_unique(array_map('absint',$_POST['stations']))):array();
        if ($target==='operator') {
            $m=get_userdata($manager);
            if (!$m || !in_array('fqm_manager',$m->roles,true)) { $this->fail('Хариуцах эрхлэгч сонгоно уу.'); }
            foreach ($ids as $sid) { $s=$this->station($sid,true); if ((int)$s['manager_id']!==$manager) { $this->fail('Зөвхөн тухайн эрхлэгчийн ШТС-ыг сонгоно уу.'); } }
        }
        $id=absint($this->value('id')); $name=$this->value('name');
        if (!$name) { $this->fail('Ажилтны нэрийг оруулна уу.'); }
        $pass=isset($_POST['password'])&&is_string($_POST['password'])?wp_unslash($_POST['password']):'';
        if ((!$id || $pass!=='') && strlen($pass)<10) { $this->fail('Нууц үг 10-аас доошгүй тэмдэгттэй байна.'); }
        $data=array('display_name'=>$name,'role'=>$target==='manager'?'fqm_manager':'fqm_operator');
        if ($pass!=='') { $data['user_pass']=$pass; }
        if ($id) {
            $old=get_userdata($id);
            if (!$old || !in_array($data['role'],$old->roles,true) || ($role==='manager' && (int)get_user_meta($id,'fqm_manager',true)!==get_current_user_id())) { $this->fail('Энэ хэрэглэгчийг өөрчлөх эрхгүй.',403); }
            $data['ID']=$id; $r=wp_update_user($data);
        } else {
            $login=$this->value('login');
            if (!preg_match('/^[a-zA-Z0-9._-]{3,60}$/D',$login)) { $this->fail('Нэвтрэх нэрийг латин үсэг, тоогоор 3–60 тэмдэгттэй бичнэ үү.'); }
            $data['user_login']=$login; $r=wp_insert_user($data);
        }
        if (is_wp_error($r)) { $this->fail('Ажилтныг хадгалсангүй. Нэвтрэх нэр давхардсан эсэхийг шалгана уу.'); }
        if ($target==='operator') { update_user_meta($r,'fqm_manager',$manager); update_user_meta($r,'fqm_stations',$ids); }
        $this->audit('save_'.$target,0,'Хэрэглэгч #'.$r.' · '.$name);
        return array('id'=>$r);
    }
    private function save_policy() {
        if ($this->admin()) { update_option('fqm2_global_one',$this->value('global_one')==='1'); $manager=absint($this->value('manager_id')); }
        elseif ($this->role()==='manager') { $manager=get_current_user_id(); }
        else { $this->fail('Тохиргоо өөрчлөх эрхгүй.',403); }
        if ($manager) {
            $u=get_userdata($manager); if (!$u || !in_array('fqm_manager',$u->roles,true)) { $this->fail('Эрхлэгч олдсонгүй.'); }
            $policy=$this->value('policy'); if (!in_array($policy,array('one','per_station'),true)) { $this->fail('Дүрэм буруу байна.'); }
            update_user_meta($manager,'fqm_policy',$policy);
        }
        $this->audit('policy',0,'Давхар захиалгын дүрэм шинэчилсэн · эрхлэгч #'.$manager);
        return array('ok'=>true);
    }
}
register_activation_hook(__FILE__,array('FQM_App','activate'));
new FQM_App();
