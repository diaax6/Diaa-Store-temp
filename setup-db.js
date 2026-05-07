const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://lpuscpaazrfiqcwrvwxd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwdXNjcGFhenJmaXFjd3J2d3hkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODExMDkxMCwiZXhwIjoyMDkzNjg2OTEwfQ.1VIsgYRh8AnaTyEKCCswiGMgc0sB3vz4Ro2AmN_OL_Q'
);

async function setup() {
    // Create aliases table
    const { error: e1 } = await supabase.rpc('exec_sql', { sql: `
        CREATE TABLE IF NOT EXISTS aliases (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            domain TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now(),
            is_active BOOLEAN DEFAULT true,
            note TEXT
        );
    `});
    
    if (e1) {
        console.log('aliases table error (may already exist):', e1.message);
        // Try direct approach - just test if table exists
        const { error: testErr } = await supabase.from('aliases').select('id').limit(1);
        if (testErr) {
            console.log('aliases table does not exist. Please create it manually in Supabase SQL editor.');
            console.log('SQL:');
            console.log(`
CREATE TABLE aliases (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    domain TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    is_active BOOLEAN DEFAULT true,
    note TEXT
);

CREATE TABLE emails (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    alias_id UUID REFERENCES aliases(id) ON DELETE CASCADE,
    uid INTEGER,
    subject TEXT,
    from_name TEXT,
    from_address TEXT,
    to_addresses JSONB,
    date TIMESTAMPTZ,
    text_body TEXT,
    html_body TEXT,
    has_attachments BOOLEAN DEFAULT false,
    attachment_count INTEGER DEFAULT 0,
    fetched_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_aliases_email ON aliases(email);
CREATE INDEX idx_emails_alias_id ON emails(alias_id);
            `);
        } else {
            console.log('✅ aliases table already exists');
        }
    } else {
        console.log('✅ aliases table created');
    }

    // Create emails table
    const { error: e2 } = await supabase.rpc('exec_sql', { sql: `
        CREATE TABLE IF NOT EXISTS emails (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            alias_id UUID REFERENCES aliases(id) ON DELETE CASCADE,
            uid INTEGER,
            subject TEXT,
            from_name TEXT,
            from_address TEXT,
            to_addresses JSONB,
            date TIMESTAMPTZ,
            text_body TEXT,
            html_body TEXT,
            has_attachments BOOLEAN DEFAULT false,
            attachment_count INTEGER DEFAULT 0,
            fetched_at TIMESTAMPTZ DEFAULT now()
        );
    `});
    
    if (e2) {
        const { error: testErr } = await supabase.from('emails').select('id').limit(1);
        if (testErr) {
            console.log('emails table does not exist. See SQL above.');
        } else {
            console.log('✅ emails table already exists');
        }
    } else {
        console.log('✅ emails table created');
    }
}

setup().catch(console.error);
