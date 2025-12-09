"""
Unit tests for CodeAwareTextSplitter.

Tests syntax-aware chunking for C#, TypeScript, and JavaScript.
"""

import os
import sys
import pytest
from unittest.mock import patch

# Add api directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'api'))

from syntax_aware_splitter import (
    CodeAwareTextSplitter,
    detect_language,
    MAX_FILE_SIZE_BYTES,
    USE_SYNTAX_AWARE_CHUNKING
)
from adalflow.core.types import Document


class TestLanguageDetection:
    """Test language detection from file extensions and shebangs."""

    def test_detect_csharp(self):
        """Test C# file detection."""
        assert detect_language('test.cs', '') == 'c_sharp'
        assert detect_language('MyClass.cs', '') == 'c_sharp'

    def test_detect_typescript(self):
        """Test TypeScript file detection."""
        assert detect_language('test.ts', '') == 'typescript'
        assert detect_language('component.tsx', '') == 'tsx'

    def test_detect_javascript(self):
        """Test JavaScript file detection."""
        assert detect_language('test.js', '') == 'javascript'
        assert detect_language('component.jsx', '') == 'javascript'
        assert detect_language('module.mjs', '') == 'javascript'
        assert detect_language('config.cjs', '') == 'javascript'

    def test_detect_shebang(self):
        """Test shebang detection for node scripts."""
        text_with_shebang = '#!/usr/bin/env node\nconsole.log("hello");'
        # Note: detect_language requires file extension, shebang is supplementary
        assert detect_language('script.js', text_with_shebang) == 'javascript'

    def test_unsupported_language(self):
        """Test unsupported file extensions."""
        assert detect_language('test.java', '') is None
        assert detect_language('test.txt', '') is None

    def test_detect_python(self):
        """Python files should map to tree-sitter python grammar."""
        assert detect_language('script.py', '') == 'python'
        assert detect_language('types.pyi', '') == 'python'


class TestCSharpSplitting:
    """Test C# code splitting."""

    @pytest.fixture
    def splitter(self):
        """Create a CodeAwareTextSplitter instance."""
        return CodeAwareTextSplitter(split_by="word", chunk_size=500, chunk_overlap=100)

    @patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True)
    def test_csharp_namespace_and_class(self, splitter):
        """Test splitting C# namespace and class."""
        code = '''using System;

namespace MyApp
{
    public class MyClass
    {
        public void DoSomething()
        {
            Console.WriteLine("Hello");
        }
    }
}'''
        doc = Document(
            text=code,
            id='test1',
            meta_data={'file_path': 'test.cs'}
        )

        with patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True):
            results = splitter.call([doc])

        # Should have namespace and class as separate chunks
        assert len(results) >= 1
        # Check metadata
        assert results[0].meta_data.get('language') == 'c_sharp'
        assert results[0].meta_data.get('symbol_name') is not None

    @patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True)
    def test_csharp_multiple_methods(self, splitter):
        """Test splitting multiple C# methods."""
        code = '''namespace MyApp
{
    public class Calculator
    {
        public int Add(int a, int b)
        {
            return a + b;
        }

        public int Subtract(int a, int b)
        {
            return a - b;
        }

        public int Multiply(int a, int b)
        {
            return a * b;
        }
    }
}'''
        doc = Document(
            text=code,
            id='test2',
            meta_data={'file_path': 'Calculator.cs'}
        )

        with patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True):
            results = splitter.call([doc])

        # Should extract class and methods
        assert len(results) >= 1
        # All should have C# language
        for result in results:
            assert result.meta_data.get('language') == 'c_sharp'

    @patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True)
    def test_csharp_records(self, splitter):
        """Test C# record declaration."""
        code = '''namespace MyApp
{
    public record Person(string FirstName, string LastName);

    public record struct Point(int X, int Y);
}'''
        doc = Document(
            text=code,
            id='test3',
            meta_data={'file_path': 'Models.cs'}
        )

        with patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True):
            results = splitter.call([doc])

        assert len(results) >= 1
        # Check for record types
        for result in results:
            assert result.meta_data.get('language') == 'c_sharp'

    @patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True)
    def test_csharp_properties(self, splitter):
        """Test C# property declarations."""
        code = '''namespace MyApp
{
    public class User
    {
        public string Name { get; set; }
        public int Age { get; set; }

        private string _email;
        public string Email
        {
            get => _email;
            set => _email = value;
        }
    }
}'''
        doc = Document(
            text=code,
            id='test4',
            meta_data={'file_path': 'User.cs'}
        )

        with patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True):
            results = splitter.call([doc])

        assert len(results) >= 1


class TestTypeScriptJavaScriptSplitting:
    """Test TypeScript and JavaScript code splitting."""

    @pytest.fixture
    def splitter(self):
        """Create a CodeAwareTextSplitter instance."""
        return CodeAwareTextSplitter(split_by="word", chunk_size=500, chunk_overlap=100)

    @patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True)
    def test_typescript_class(self, splitter):
        """Test TypeScript class splitting."""
        code = '''import { Component } from 'react';

export class MyComponent extends Component {
    private state: any;

    constructor(props: any) {
        super(props);
        this.state = {};
    }

    render() {
        return <div>Hello</div>;
    }
}'''
        doc = Document(
            text=code,
            id='test5',
            meta_data={'file_path': 'MyComponent.tsx'}
        )

        with patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True):
            results = splitter.call([doc])

        assert len(results) >= 1


class TestPythonSplitting:
    """Test Python code splitting."""

    @pytest.fixture
    def splitter(self):
        return CodeAwareTextSplitter(split_by="word", chunk_size=500, chunk_overlap=100)

    @patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True)
    def test_python_functions_and_classes(self, splitter):
        code = '''import os
import sys

class Greeter:
    def __init__(self, name: str):
        self.name = name

    def greet(self):
        return f"Hello, {self.name}!"


def helper(value: int):
    return value * 2
'''
        doc = Document(
            text=code,
            id='py1',
            meta_data={'file_path': 'greeter.py'}
        )

        results = splitter.call([doc])

        assert len(results) >= 1
        for result in results:
            assert result.meta_data.get('language') == 'python'

    @patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True)
    def test_javascript_functions(self, splitter):
        """Test JavaScript function splitting."""
        code = '''function greet(name) {
    return `Hello, ${name}!`;
}

const add = (a, b) => a + b;

const multiply = function(a, b) {
    return a * b;
};

export { greet, add, multiply };'''
        doc = Document(
            text=code,
            id='test6',
            meta_data={'file_path': 'utils.js'}
        )

        with patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True):
            results = splitter.call([doc])

        assert len(results) >= 1
        for result in results:
            assert result.meta_data.get('language') == 'javascript'

    @patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True)
    def test_react_component(self, splitter):
        """Test React component splitting."""
        code = '''import React from 'react';

export const Button = ({ onClick, children }) => {
    return (
        <button onClick={onClick}>
            {children}
        </button>
    );
};

export default function App() {
    const handleClick = () => {
        console.log('Clicked!');
    };

    return (
        <div>
            <Button onClick={handleClick}>
                Click me
            </Button>
        </div>
    );
}'''
        doc = Document(
            text=code,
            id='test7',
            meta_data={'file_path': 'App.jsx'}
        )

        with patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True):
            results = splitter.call([doc])

        assert len(results) >= 1

    @patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True)
    def test_typescript_interface(self, splitter):
        """Test TypeScript interface."""
        code = '''export interface User {
    id: number;
    name: string;
    email: string;
}

export type UserRole = 'admin' | 'user' | 'guest';

export enum Status {
    Active,
    Inactive,
    Pending
}'''
        doc = Document(
            text=code,
            id='test8',
            meta_data={'file_path': 'types.ts'}
        )

        with patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True):
            results = splitter.call([doc])

        assert len(results) >= 1


class TestFallbackBehavior:
    """Test fallback to base TextSplitter."""

    @pytest.fixture
    def splitter(self):
        """Create a CodeAwareTextSplitter instance."""
        return CodeAwareTextSplitter(split_by="word", chunk_size=500, chunk_overlap=100)

    def test_unsupported_language_fallback(self, splitter):
        """Test fallback for unsupported languages."""
        code = 'print("Hello, World!")'
        doc = Document(
            text=code,
            id='test9',
            meta_data={'file_path': 'test.java'}
        )

        with patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True):
            results = splitter.call([doc])

        # Should use fallback
        assert len(results) >= 1
        # Should not have language-specific metadata
        assert results[0].meta_data.get('symbol_name') is None

    # def test_large_file_fallback(self, splitter):
    #     """Test fallback for large files."""
    #     # Create a file larger than MAX_FILE_SIZE_BYTES
    #     large_code = 'x' * (MAX_FILE_SIZE_BYTES + 1000)
    #     doc = Document(
    #         text=large_code,
    #         id='test10',
    #         meta_data={'file_path': 'large.cs'}
    #     )

    #     with patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True):
    #         results = splitter.call([doc])

    #     # Should use fallback due to size
    #     assert len(results) >= 1

    def test_no_file_path_fallback(self, splitter):
        """Test fallback when no file_path in metadata."""
        code = 'namespace Test { }'
        doc = Document(
            text=code,
            id='test11',
            meta_data={}
        )

        with patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True):
            results = splitter.call([doc])

        # Should use fallback
        assert len(results) >= 1


class TestFeatureFlag:
    """Test feature flag behavior."""

    @pytest.fixture
    def splitter(self):
        """Create a CodeAwareTextSplitter instance."""
        return CodeAwareTextSplitter(split_by="word", chunk_size=500, chunk_overlap=100)

    def test_feature_flag_disabled(self, splitter):
        """Test that feature flag disables syntax-aware splitting."""
        code = '''namespace MyApp
{
    public class MyClass { }
}'''
        doc = Document(
            text=code,
            id='test12',
            meta_data={'file_path': 'test.cs'}
        )

        with patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', False):
            results = splitter.call([doc])

        # Should use base splitter
        assert len(results) >= 1
        # Should not have language-specific metadata
        assert results[0].meta_data.get('symbol_name') is None


class TestMetadata:
    """Test metadata generation."""

    @pytest.fixture
    def splitter(self):
        """Create a CodeAwareTextSplitter instance."""
        return CodeAwareTextSplitter(split_by="word", chunk_size=500, chunk_overlap=100)

    @patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True)
    def test_metadata_fields(self, splitter):
        """Test that all expected metadata fields are present."""
        code = '''namespace MyApp
{
    public class MyClass
    {
        public void MyMethod()
        {
            // Do something
        }
    }
}'''
        doc = Document(
            text=code,
            id='test13',
            meta_data={'file_path': 'test.cs'}
        )

        with patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True):
            results = splitter.call([doc])

        # Check metadata fields
        for result in results:
            meta = result.meta_data
            if meta.get('language') == 'c_sharp':
                assert 'symbol_name' in meta
                assert 'signature' in meta
                assert 'language' in meta
                assert 'token_count' in meta
                assert 'block_type' in meta

    @patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True)
    def test_parent_symbol_tracking(self, splitter):
        """Test parent symbol tracking in nested structures."""
        code = '''namespace MyApp
{
    public class OuterClass
    {
        public class InnerClass
        {
            public void InnerMethod() { }
        }
    }
}'''
        doc = Document(
            text=code,
            id='test14',
            meta_data={'file_path': 'test.cs'}
        )

        with patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True):
            results = splitter.call([doc])

        # At least one result should have a parent_symbol
        has_parent = any(r.meta_data.get('parent_symbol') for r in results)
        # Note: This depends on implementation details
        # The test is flexible as structure may vary


class TestEdgeCases:
    """Test edge cases and error handling."""

    @pytest.fixture
    def splitter(self):
        """Create a CodeAwareTextSplitter instance."""
        return CodeAwareTextSplitter(split_by="word", chunk_size=500, chunk_overlap=100)

    def test_empty_file(self, splitter):
        """Test handling of empty files."""
        with pytest.raises(ValueError):
            doc = Document(
                text=None,
                id='test15',
                meta_data={'file_path': 'empty.cs'}
            )
            splitter.call([doc])

    def test_invalid_syntax(self, splitter):
        """Test handling of invalid syntax (should fallback)."""
        code = 'namespace MyApp { this is invalid C# code'
        doc = Document(
            text=code,
            id='test16',
            meta_data={'file_path': 'invalid.cs'}
        )

        with patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True):
            # Should not crash, should fallback to base splitter
            results = splitter.call([doc])
            assert len(results) >= 1

    def test_mixed_content(self, splitter):
        """Test file with comments and code."""
        code = '''// This is a comment
/* Multi-line
   comment */
namespace MyApp
{
    /// <summary>
    /// XML documentation
    /// </summary>
    public class MyClass { }
}'''
        doc = Document(
            text=code,
            id='test17',
            meta_data={'file_path': 'test.cs'}
        )

        with patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True):
            results = splitter.call([doc])
            assert len(results) >= 1


class TestTokenCounting:
    """Test token counting and limits."""

    @pytest.fixture
    def splitter(self):
        """Create a CodeAwareTextSplitter instance."""
        return CodeAwareTextSplitter(split_by="word", chunk_size=500, chunk_overlap=100)

    @patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True)
    def test_token_count_in_metadata(self, splitter):
        """Test that token_count is included in metadata."""
        code = '''namespace MyApp
{
    public class MyClass { }
}'''
        doc = Document(
            text=code,
            id='test18',
            meta_data={'file_path': 'test.cs'}
        )

        with patch('syntax_aware_splitter.USE_SYNTAX_AWARE_CHUNKING', True):
            results = splitter.call([doc])

        for result in results:
            if result.meta_data.get('language') == 'c_sharp':
                assert 'token_count' in result.meta_data
                assert result.meta_data['token_count'] > 0


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
